import Stripe from "stripe";
import { env } from "./env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

interface CreateEntryCheckoutParams {
  tournamentId: string;
  tournamentName: string;
  guildId: string;
  participantId: string;
  discordId: string;
  amountCents: number;
  currency: string;
}

/**
 * Одноразовый платёж (mode: "payment") за вход в турнир — не подписка.
 * tournamentId/participantId кладём и в metadata, и в client_reference_id,
 * чтобы webhook мог однозначно сопоставить сессию с TournamentParticipant
 * даже если что-то из полей потеряется на стороне Stripe UI.
 *
 * successUrl/cancelUrl должны вести на страницу турнира в веб-дэшборде —
 * сам факт возврата на success ничего не подтверждает, участник переводится
 * в CONFIRMED только по серверному webhook (checkout.session.completed),
 * никогда по редиректу браузера.
 */
export async function createEntryCheckoutSession(params: CreateEntryCheckoutParams) {
  const {
    tournamentId,
    tournamentName,
    guildId,
    participantId,
    discordId,
    amountCents,
    currency,
  } = params;

  const successUrl = `${env.WEB_APP_URL}/servers/${guildId}/tournaments/${tournamentId}?payment=success`;
  const cancelUrl = `${env.WEB_APP_URL}/servers/${guildId}/tournaments/${tournamentId}?payment=cancelled`;

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: participantId,
    metadata: { tournamentId, participantId, discordId, guildId },
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: `Вход в турнир: ${tournamentName}`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Сессия истекает сама по себе через 24ч у Stripe, если не оплачена —
    // это триггерит checkout.session.expired, на который тоже подписан webhook,
    // чтобы освободить статус участника (не висеть вечно в PENDING_PAYMENT).
  });
}

export async function refundPayment(paymentIntentId: string) {
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}

export function constructWebhookEvent(rawBody: Buffer, signature: string) {
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
