import { prisma } from "@horizon/database";

/** Полночь UTC текущего дня — ключ строки Analytics для "сегодня". */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type IncrementableField =
  | "messageCount"
  | "newMembers"
  | "leftMembers"
  | "voiceMinutes"
  | "moderationActs";

/**
 * Атомарно увеличивает счётчик за сегодняшний день (создаёт строку, если её ещё нет).
 * Используется для событий, которые накапливаются в течение дня (сообщения,
 * входы/выходы участников, голосовые минуты).
 */
export async function bumpAnalytics(guildId: string, field: IncrementableField, delta = 1) {
  const date = todayUTC();
  await prisma.analytics.upsert({
    where: { guildId_date: { guildId, date } },
    create: { guildId, date, [field]: delta },
    update: { [field]: { increment: delta } },
  });
}

/**
 * Записывает АБСОЛЮТНЫЙ снапшот (не инкремент) — например текущее количество
 * участников/онлайн на момент вызова. Вызывается периодически job'ом ниже
 * и сразу после join/leave, чтобы графики Member Growth/Online Users были
 * актуальны без ожидания следующего тика.
 */
export async function snapshotGuildCounts(guildId: string, memberCount: number, onlineCount: number) {
  const date = todayUTC();
  await prisma.analytics.upsert({
    where: { guildId_date: { guildId, date } },
    create: { guildId, date, memberCount, onlineCount },
    update: { memberCount, onlineCount },
  });
}
