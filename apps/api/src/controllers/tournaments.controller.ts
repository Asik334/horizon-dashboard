import { Response } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@horizon/database";
import { AuthedRequest } from "../middleware/auth";
import { discordBot } from "../lib/discord";
import { generateSingleEliminationBracket, nextMatchSlot } from "../lib/bracket";
import { refundPayment } from "../lib/stripe";
import { broadcastToGuild } from "../ws";
import { env } from "../lib/env";

// Эти роуты все проходят requireGuildAccess (см. tournaments.routes.ts) —
// доступны только пользователям с правами администратора гильдии в Discord.

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  game: z.string().min(1).max(50).default("CS2"),
  entryFeeCents: z.number().int().min(0).max(100_000_00), // верхняя граница — защита от опечатки на 2 лишних нуля
  currency: z.string().length(3).toLowerCase().default("usd"),
  maxParticipants: z.number().int().min(2).max(256),
  minParticipants: z.number().int().min(2).default(2),
  prizePool: z.string().max(500).optional(),
  registrationOpensAt: z.coerce.date().optional(),
  registrationClosesAt: z.coerce.date().optional(),
  startsAt: z.coerce.date().optional(),
});

// POST /api/guilds/:guildId/tournaments
export async function createTournament(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const data = parsed.data;

  if (data.minParticipants > data.maxParticipants) {
    return res.status(400).json({ error: "INVALID_BODY", message: "minParticipants не может быть больше maxParticipants" });
  }

  const tournament = await prisma.tournament.create({
    data: {
      guildId,
      name: data.name,
      description: data.description,
      game: data.game,
      entryFeeCents: data.entryFeeCents,
      currency: data.currency,
      maxParticipants: data.maxParticipants,
      minParticipants: data.minParticipants,
      prizePool: data.prizePool,
      registrationOpensAt: data.registrationOpensAt,
      registrationClosesAt: data.registrationClosesAt,
      startsAt: data.startsAt,
      createdByUserId: req.user!.id,
      status: "DRAFT",
    },
  });

  res.status(201).json({ tournament });
}

// GET /api/guilds/:guildId/tournaments
export async function listTournaments(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const tournaments = await prisma.tournament.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });
  res.json({ tournaments });
}

// GET /api/guilds/:guildId/tournaments/:id
export async function getTournamentAdmin(req: AuthedRequest, res: Response) {
  const { guildId, id } = req.params;
  const tournament = await prisma.tournament.findFirst({
    where: { id, guildId },
    include: {
      participants: { orderBy: { createdAt: "asc" } },
      matches: { orderBy: [{ round: "asc" }, { position: "asc" }] },
    },
  });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ tournament });
}

const announceChannelSchema = z.object({ channelId: z.string().min(1) });

/**
 * POST /api/guilds/:guildId/tournaments/:id/open-registration
 * Переводит турнир в REGISTRATION_OPEN и постит анонс с кнопкой-ссылкой
 * на страницу регистрации/оплаты в веб-дэшборде (кнопка типа LINK — Discord
 * сам откроет URL, взаимодействие не требует ответа от нашего сервера).
 */
export async function openRegistration(req: AuthedRequest, res: Response) {
  const { guildId, id } = req.params;
  const parsed = announceChannelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });

  const tournament = await prisma.tournament.findFirst({ where: { id, guildId } });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });
  if (tournament.status !== "DRAFT") {
    return res.status(409).json({ error: "INVALID_STATUS", message: "Регистрацию можно открыть только из статуса DRAFT" });
  }

  const joinUrl = `${env.WEB_APP_URL}/servers/${guildId}/tournaments/${tournament.id}`;
  const feeText =
    tournament.entryFeeCents > 0
      ? `${(tournament.entryFeeCents / 100).toFixed(2)} ${tournament.currency.toUpperCase()}`
      : "Бесплатно";

  const embed = {
    title: `🏆 ${tournament.name}`,
    description: tournament.description ?? undefined,
    color: 0x5865f2,
    fields: [
      { name: "Игра", value: tournament.game, inline: true },
      { name: "Вход", value: feeText, inline: true },
      { name: "Мест", value: String(tournament.maxParticipants), inline: true },
      ...(tournament.prizePool ? [{ name: "Призовой фонд", value: tournament.prizePool, inline: false }] : []),
      ...(tournament.startsAt ? [{ name: "Старт", value: `<t:${Math.floor(tournament.startsAt.getTime() / 1000)}:F>`, inline: false }] : []),
    ],
    footer: { text: "Регистрация и оплата — по кнопке ниже" },
  };

  const components = [
    {
      type: 1, // ACTION_ROW
      components: [
        { type: 2 /* BUTTON */, style: 5 /* LINK */, label: "Зарегистрироваться", url: joinUrl },
      ],
    },
  ];

  const { data: message } = await discordBot.sendChannelMessage(parsed.data.channelId, {
    embeds: [embed],
    components,
  });

  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      status: "REGISTRATION_OPEN",
      announceChannelId: parsed.data.channelId,
      announceMessageId: message.id,
    },
  });

  broadcastToGuild(guildId, { type: "tournament:updated", payload: updated });
  res.json({ tournament: updated });
}

/**
 * POST /api/guilds/:guildId/tournaments/:id/close-registration
 * Закрывает регистрацию и сразу генерирует сетку из всех CONFIRMED
 * (оплативших) участников. PENDING_PAYMENT слоты, которые так и не
 * оплатили — просто не попадают в сетку (их Payment остаётся PENDING,
 * Stripe сам отменит сессию по истечении 24ч).
 */
export async function closeRegistrationAndGenerateBracket(req: AuthedRequest, res: Response) {
  const { guildId, id } = req.params;

  const tournament = await prisma.tournament.findFirst({
    where: { id, guildId },
    include: { participants: { where: { status: "CONFIRMED" } } },
  });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });
  if (tournament.status !== "REGISTRATION_OPEN") {
    return res.status(409).json({ error: "INVALID_STATUS", message: "Ожидался статус REGISTRATION_OPEN" });
  }
  if (tournament.participants.length < tournament.minParticipants) {
    return res.status(409).json({
      error: "NOT_ENOUGH_PARTICIPANTS",
      message: `Оплативших участников (${tournament.participants.length}) меньше минимума (${tournament.minParticipants})`,
    });
  }

  // Случайный посев — простое и честное распределение для первой версии
  // (ручной посев по рейтингу можно добавить отдельным полем seed в UI позже).
  const shuffled = [...tournament.participants].sort(() => Math.random() - 0.5);
  const bracketParticipants = shuffled.map((p, idx) => ({ id: p.id, seed: idx + 1 }));

  const plan = generateSingleEliminationBracket(bracketParticipants);

  await prisma.$transaction(async (tx) => {
    // Проставляем seed участникам.
    for (const bp of bracketParticipants) {
      await tx.tournamentParticipant.update({ where: { id: bp.id }, data: { seed: bp.seed } });
    }

    // Создаём все матчи сетки разом.
    const createdMatches = await Promise.all(
      plan.map((m) =>
        tx.tournamentMatch.create({
          data: {
            tournamentId: tournament.id,
            round: m.round,
            position: m.position,
            participantAId: m.participantAId,
            participantBId: m.participantBId,
            status: m.isBye ? "BYE" : m.round === 1 ? "READY" : "PENDING",
          },
        })
      )
    );

    // Автоматически проводим BYE первого раунда: единственный реальный
    // участник сразу засчитывается победителем и продвигается дальше.
    const byeMatches = createdMatches.filter(
      (m) => m.round === 1 && m.status === "BYE" && (m.participantAId || m.participantBId)
    );
    for (const match of byeMatches) {
      const winnerId = match.participantAId ?? match.participantBId!;
      await tx.tournamentMatch.update({
        where: { id: match.id },
        data: { winnerId, status: "COMPLETED", completedAt: new Date() },
      });
      await advanceWinner(tx, tournament.id, match.round, match.position, winnerId);
    }

    await tx.tournament.update({ where: { id: tournament.id }, data: { status: "IN_PROGRESS" } });
  });

  const updated = await prisma.tournament.findUnique({
    where: { id: tournament.id },
    include: { matches: { orderBy: [{ round: "asc" }, { position: "asc" }] }, participants: true },
  });

  broadcastToGuild(guildId, { type: "tournament:bracket_generated", payload: updated });
  res.json({ tournament: updated });
}

/** Прокидывает победителя матча (round, position) в матч следующего раунда. */
async function advanceWinner(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  round: number,
  position: number,
  winnerId: string
) {
  const next = nextMatchSlot(round, position);
  const nextMatch = await tx.tournamentMatch.findUnique({
    where: { tournamentId_round_position: { tournamentId, round: next.round, position: next.position } },
  });
  if (!nextMatch) return; // это был финал — дальше некому продвигаться

  const data = next.slot === "A" ? { participantAId: winnerId } : { participantBId: winnerId };
  const updatedNext = await tx.tournamentMatch.update({ where: { id: nextMatch.id }, data });

  if (updatedNext.participantAId && updatedNext.participantBId) {
    await tx.tournamentMatch.update({ where: { id: nextMatch.id }, data: { status: "READY" } });
  }
}

const resultSchema = z.object({
  winnerId: z.string().min(1),
  scoreA: z.number().int().min(0).optional(),
  scoreB: z.number().int().min(0).optional(),
});

// POST /api/guilds/:guildId/tournaments/:id/matches/:matchId/result
export async function reportMatchResult(req: AuthedRequest, res: Response) {
  const { guildId, id, matchId } = req.params;
  const parsed = resultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const { winnerId, scoreA, scoreB } = parsed.data;

  const tournament = await prisma.tournament.findFirst({ where: { id, guildId } });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });

  const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId: id } });
  if (!match) return res.status(404).json({ error: "MATCH_NOT_FOUND" });
  if (match.status !== "READY") {
    return res.status(409).json({ error: "INVALID_STATUS", message: "Матч должен быть в статусе READY" });
  }
  if (winnerId !== match.participantAId && winnerId !== match.participantBId) {
    return res.status(400).json({ error: "INVALID_WINNER", message: "winnerId должен быть одним из участников матча" });
  }

  const isFinal = await prisma.tournamentMatch.count({
    where: { tournamentId: id, round: { gt: match.round } },
  }) === 0;

  await prisma.$transaction(async (tx) => {
    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: { winnerId, scoreA, scoreB, status: "COMPLETED", completedAt: new Date() },
    });

    const loserId = winnerId === match.participantAId ? match.participantBId : match.participantAId;
    if (loserId) {
      await tx.tournamentParticipant.update({ where: { id: loserId }, data: { eliminatedAt: new Date() } });
    }

    if (isFinal) {
      await tx.tournament.update({ where: { id }, data: { status: "COMPLETED" } });
    } else {
      await advanceWinner(tx, id, match.round, match.position, winnerId);
    }
  });

  const updated = await prisma.tournament.findUnique({
    where: { id },
    include: { matches: { orderBy: [{ round: "asc" }, { position: "asc" }] }, participants: true },
  });

  broadcastToGuild(guildId, { type: "tournament:match_result", payload: { matchId, winnerId } });
  res.json({ tournament: updated });
}

// POST /api/guilds/:guildId/tournaments/:id/cancel
// Отменяет турнир и возвращает деньги всем, кто уже оплатил (CONFIRMED).
export async function cancelTournament(req: AuthedRequest, res: Response) {
  const { guildId, id } = req.params;

  const tournament = await prisma.tournament.findFirst({
    where: { id, guildId },
    include: { participants: { where: { status: "CONFIRMED" }, include: { payment: true } } },
  });
  if (!tournament) return res.status(404).json({ error: "NOT_FOUND" });
  if (tournament.status === "COMPLETED" || tournament.status === "CANCELLED") {
    return res.status(409).json({ error: "INVALID_STATUS" });
  }

  const refundErrors: string[] = [];
  for (const participant of tournament.participants) {
    const paymentIntentId = participant.payment?.providerPaymentIntentId;
    if (!paymentIntentId) continue;
    try {
      await refundPayment(paymentIntentId);
      await prisma.payment.update({
        where: { id: participant.payment!.id },
        data: { status: "REFUNDED" },
      });
      await prisma.tournamentParticipant.update({
        where: { id: participant.id },
        data: { status: "REFUNDED" },
      });
    } catch (err: any) {
      // Не роняем всю отмену турнира из-за одного неудавшегося рефанда —
      // логируем и продолжаем остальных, проблемные возвращаем в ответе,
      // чтобы админ мог обработать их вручную через Stripe Dashboard.
      console.error(`Refund failed for participant ${participant.id}:`, err.message);
      refundErrors.push(participant.discordId);
    }
  }

  const updated = await prisma.tournament.update({ where: { id }, data: { status: "CANCELLED" } });

  broadcastToGuild(guildId, { type: "tournament:cancelled", payload: updated });
  res.json({ tournament: updated, refundErrors });
}
