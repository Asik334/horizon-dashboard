import { Response } from "express";
import { z } from "zod";
import { prisma } from "@horizon/database";
import { AuthedRequest } from "../middleware/auth";

const periodSchema = z.object({
  period: z.enum(["24h", "7d", "30d", "90d"]).default("7d"),
});

function periodToDays(period: string) {
  return { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[period] ?? 7;
}

// GET /api/guilds/:guildId/analytics?period=7d
export async function getAnalytics(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = periodSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_QUERY" });

  const days = periodToDays(parsed.data.period);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.analytics.findMany({
    where: { guildId, date: { gte: since } },
    orderBy: { date: "asc" },
  });

  res.json({ period: parsed.data.period, data: rows });
}

// GET /api/guilds/:guildId/ai-analysis — последний снапшот + генерация при отсутствии свежего
export async function getAIAnalysis(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;

  const latest = await prisma.aIAnalysis.findFirst({
    where: { guildId },
    orderBy: { createdAt: "desc" },
  });

  // Если анализа нет или он старше 6 часов — считается устаревшим для фронта,
  // но мы НЕ блокируем ответ синхронной генерацией (это должно быть отдельным
  // background job / очередью, см. TODO в README). Отдаём то, что есть, с флагом.
  const isStale = !latest || latest.createdAt < new Date(Date.now() - 6 * 60 * 60 * 1000);

  res.json({ analysis: latest, stale: isStale });
}

// GET /api/guilds/:guildId/logs (audit) — общие системные логи (join/leave/roles/channels)
const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  type: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().optional(),
});

export async function getAuditLogs(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_QUERY" });
  const { page, pageSize, type, from, to, search } = parsed.data;

  const where = {
    guildId,
    ...(type ? { type: type as any } : {}),
    ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    ...(search ? { description: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}
