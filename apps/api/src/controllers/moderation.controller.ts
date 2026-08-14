import { Response } from "express";
import { z } from "zod";
import { prisma } from "@horizon/database";
import { AuthedRequest } from "../middleware/auth";
import { discordBot } from "../lib/discord";
import { broadcastToGuild } from "../ws";

const actionBodySchema = z.object({
  targetDiscordId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const timeoutBodySchema = actionBodySchema.extend({
  durationMinutes: z.number().int().min(1).max(40320), // Discord max = 28 дней
});

async function upsertTargetMember(guildId: string, discordId: string, username?: string) {
  return prisma.guildMember.upsert({
    where: { guildId_discordId: { guildId, discordId } },
    create: { guildId, discordId, username: username ?? discordId },
    update: username ? { username } : {},
  });
}

async function logModeration(
  guildId: string,
  targetMember: { id: string; username: string },
  action: "WARN" | "TIMEOUT" | "KICK" | "BAN" | "UNBAN",
  reason: string | undefined,
  moderator: { id: string; username: string }
) {
  const log = await prisma.moderationLog.create({
    data: {
      guildId,
      targetMemberId: targetMember.id,
      targetDiscordId: targetMember.id,
      targetUsername: targetMember.username,
      action,
      reason,
      moderatorUserId: moderator.id,
      moderatorName: moderator.username,
    },
  });
  broadcastToGuild(guildId, { type: "moderation:new", payload: log });
  return log;
}

// POST /api/guilds/:guildId/moderation/warn
export async function warnMember(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = actionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const { targetDiscordId, reason } = parsed.data;

  const member = await upsertTargetMember(guildId, targetDiscordId);
  const warning = await prisma.warning.create({
    data: { guildId, memberId: member.id, reason: reason ?? "Причина не указана" },
  });
  await logModeration(guildId, member, "WARN", reason, req.user!);

  res.status(201).json({ warning });
}

// POST /api/guilds/:guildId/moderation/timeout
export async function timeoutMember(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = timeoutBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const { targetDiscordId, reason, durationMinutes } = parsed.data;

  const until = new Date(Date.now() + durationMinutes * 60_000);
  await discordBot.timeoutMember(guildId, targetDiscordId, until, reason);

  const member = await upsertTargetMember(guildId, targetDiscordId);
  const log = await logModeration(guildId, member, "TIMEOUT", reason, req.user!);

  res.status(201).json({ log, until });
}

// POST /api/guilds/:guildId/moderation/kick
export async function kickMember(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = actionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const { targetDiscordId, reason } = parsed.data;

  await discordBot.kickMember(guildId, targetDiscordId, reason);

  const member = await upsertTargetMember(guildId, targetDiscordId);
  const log = await logModeration(guildId, member, "KICK", reason, req.user!);

  res.status(201).json({ log });
}

// POST /api/guilds/:guildId/moderation/ban
export async function banMember(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = actionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const { targetDiscordId, reason } = parsed.data;

  await discordBot.banMember(guildId, targetDiscordId, reason);

  const member = await upsertTargetMember(guildId, targetDiscordId);
  const log = await logModeration(guildId, member, "BAN", reason, req.user!);

  res.status(201).json({ log });
}

// POST /api/guilds/:guildId/moderation/unban
export async function unbanMember(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = actionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });
  const { targetDiscordId, reason } = parsed.data;

  await discordBot.unbanMember(guildId, targetDiscordId, reason);

  const member = await upsertTargetMember(guildId, targetDiscordId);
  const log = await logModeration(guildId, member, "UNBAN", reason, req.user!);

  res.status(201).json({ log });
}

// GET /api/guilds/:guildId/logs — общие логи модерации с фильтрами
const logsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().optional(),
});

export async function getModerationLogs(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = logsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_QUERY", details: parsed.error.flatten() });
  const { page, pageSize, action, from, to, search } = parsed.data;

  const where = {
    guildId,
    ...(action ? { action: action as any } : {}),
    ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    ...(search ? { targetUsername: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.moderationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.moderationLog.count({ where }),
  ]);

  res.json({ logs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}
