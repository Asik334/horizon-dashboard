import { Response, Request } from "express";
import { z } from "zod";
import { prisma } from "@horizon/database";
import { AuthedRequest } from "../middleware/auth";
import { createEntryCheckoutSession, constructWebhookEvent } from "../lib/stripe";
import { broadcastToGuild } from "../ws";
import Stripe from "stripe";

/**
 * Эти роуты доступны ЛЮБОМУ авторизованному через Discord пользователю
 * дэшборда (requireAuth), а не только администраторам гильдии —
 * requireGuildAccess здесь намеренно НЕ используется: обычный участник
 * сервера, желающий зарегистрироваться на турнир, не обязан иметь
 * MANAGE_GUILD. Приватность самого турнира не требуется — ссылку на него
 * получают только те, кто видит анонс в Discord-канале гильдии.
 */

// GET /api/tournaments/:guildId — список турниров, открытых для регистрации/идущих
export async function listPublicTournaments(_req: AuthedRequest, res: Response) {
  const { guildId } = _req.params;
  const tournaments = await prisma.tournament.findMany({
    where: { guildId, status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS", "COMPLETED"] } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });
  res.json({ tournaments });
}

// GET /api/tournaments/:guildId/:id
export async function getPublicTournament(req: AuthedRequest, res: Response) {
  const { guildId, id } = req.params;
  const tournament = await prisma.tournament.findFirst({
    where: { id, guildId },
    include: {
      matches: { orderBy: [{ round: "asc" }, { position: "asc" }] },
      participants: {
        select: { id: true, discordId: true, username: true, avatar: true, seed: true, status: true, eliminatedAt: true },
      },
    },
  });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });

  // Не отдаём наружу платёжные данные других участников — только свой статус.
  const me = req.user
    ? await prisma.tournamentParticipant.findUnique({
        where: { tournamentId_discordId: { tournamentId: id, discordId: req.user.discordId } },
      })
    : null;

  res.json({ tournament, myParticipation: me });
}

/**
 * POST /api/tournaments/:guildId/:id/join
 * Создаёт (или переиспользует) слот участника в статусе PENDING_PAYMENT и
 * Stripe Checkout Session. Возвращает URL, на который фронтенд должен
 * редиректнуть пользователя — сама оплата происходит на стороне Stripe,
 * наш сервер карточные данные не видит и не хранит.
 */
export async function joinTournament(req: AuthedRequest, res: Response) {
  const { guildId, id } = req.params;
  const user = req.user!;

  const tournament = await prisma.tournament.findFirst({ where: { id, guildId } });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });
  if (tournament.status !== "REGISTRATION_OPEN") {
    return res.status(409).json({ error: "REGISTRATION_CLOSED", message: "Регистрация на этот турнир не открыта" });
  }

  const existing = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_discordId: { tournamentId: id, discordId: user.discordId } },
    include: { payment: true },
  });

  if (existing?.status === "CONFIRMED" || existing?.status === "CHECKED_IN") {
    return res.status(409).json({ error: "ALREADY_JOINED", message: "Вы уже зарегистрированы на этот турнир" });
  }

  const confirmedCount = await prisma.tournamentParticipant.count({
    where: { tournamentId: id, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
  });
  if (confirmedCount >= tournament.maxParticipants) {
    return res.status(409).json({ error: "TOURNAMENT_FULL", message: "Все места заняты" });
  }

  // Бесплатный турнир (entryFeeCents = 0) — подтверждаем сразу, без Stripe.
  if (tournament.entryFeeCents === 0) {
    const participant = await prisma.tournamentParticipant.upsert({
      where: { tournamentId_discordId: { tournamentId: id, discordId: user.discordId } },
      create: {
        tournamentId: id,
        discordId: user.discordId,
        username: user.username,
        avatar: user.avatar,
        status: "CONFIRMED",
      },
      update: { status: "CONFIRMED" },
    });
    broadcastToGuild(guildId, { type: "tournament:participant_joined", payload: participant });
    return res.json({ free: true, participant });
  }

  const participant = await prisma.tournamentParticipant.upsert({
    where: { tournamentId_discordId: { tournamentId: id, discordId: user.discordId } },
    create: {
      tournamentId: id,
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar,
      status: "PENDING_PAYMENT",
    },
    update: {}, // уже существует и не CONFIRMED — переиспользуем слот, ниже пересоздадим Checkout Session
  });

  const session = await createEntryCheckoutSession({
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    guildId,
    participantId: participant.id,
    discordId: user.discordId,
    amountCents: tournament.entryFeeCents,
    currency: tournament.currency,
  });

  await prisma.payment.upsert({
    where: { participantId: participant.id },
    create: {
      tournamentId: tournament.id,
      participantId: participant.id,
      discordId: user.discordId,
      providerSessionId: session.id,
      amountCents: tournament.entryFeeCents,
      currency: tournament.currency,
      status: "PENDING",
    },
    update: {
      providerSessionId: session.id,
      status: "PENDING",
    },
  });

  res.json({ free: false, checkoutUrl: session.url });
}

// --- Stripe webhook ---
// ВАЖНО: этот роут должен быть смонтирован ДО express.json() в index.ts,
// с express.raw({ type: "application/json" }) — Stripe требует «сырое» тело
// запроса для проверки подписи (constructWebhookEvent), распарсенный JSON
// подпись не пройдёт.
export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "MISSING_SIGNATURE" });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(req.body as Buffer, signature);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "INVALID_SIGNATURE" });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const participantId = session.client_reference_id ?? (session.metadata?.participantId as string | undefined);
      if (!participantId) break;

      const payment = await prisma.payment.findUnique({ where: { participantId } });
      // Идемпотентность: Stripe может повторно доставить один и тот же
      // webhook-евент — если уже PAID, просто подтверждаем 200 и выходим.
      if (!payment || payment.status === "PAID") break;

      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

      const [, participant] = await prisma.$transaction([
        prisma.payment.update({
          where: { participantId },
          data: { status: "PAID", providerPaymentIntentId: paymentIntentId },
        }),
        prisma.tournamentParticipant.update({
          where: { id: participantId },
          data: { status: "CONFIRMED" },
          include: { tournament: { select: { guildId: true } } },
        }),
      ]);

      broadcastToGuild(participant.tournament.guildId, {
        type: "tournament:participant_confirmed",
        payload: participant,
      });
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const participantId = session.client_reference_id ?? (session.metadata?.participantId as string | undefined);
      if (!participantId) break;

      const payment = await prisma.payment.findUnique({ where: { participantId } });
      if (!payment || payment.status !== "PENDING") break;

      await prisma.payment.update({ where: { participantId }, data: { status: "CANCELLED" } });
      // Слот участника оставляем — пользователь может нажать "Оплатить" ещё раз,
      // joinTournament выше пересоздаст Checkout Session для того же participant.
      break;
    }

    case "charge.refunded": {
      // Ручной refund через Stripe Dashboard (в обход cancelTournament) —
      // синхронизируем статус на нашей стороне по paymentIntentId.
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : undefined;
      if (!paymentIntentId) break;

      const payment = await prisma.payment.findFirst({ where: { providerPaymentIntentId: paymentIntentId } });
      if (!payment || payment.status === "REFUNDED") break;

      await prisma.$transaction([
        prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } }),
        prisma.tournamentParticipant.update({ where: { id: payment.participantId }, data: { status: "REFUNDED" } }),
      ]);
      break;
    }

    default:
      break;
  }

  res.json({ received: true });
}
