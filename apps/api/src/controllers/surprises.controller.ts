import { Response } from "express";
import { z } from "zod";
import { prisma } from "@horizon/database";
import { AuthedRequest } from "../middleware/auth";

const surpriseTypeSchema = z.enum(["RANDOM_REWARD", "RANDOM_EVENT", "XP_BOOST", "ACTIVITY_CHALLENGE"]);

// GET /api/guilds/:guildId/surprises — все 4 типа с конфигом (создаём дефолты при первом обращении)
export async function listSurprises(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const types = surpriseTypeSchema.options;

  const existing = await prisma.surpriseConfig.findMany({ where: { guildId } });
  const existingTypes = new Set(existing.map((c: { type: string }) => c.type));

  const missing = types.filter((t: string) => !existingTypes.has(t));
  if (missing.length > 0) {
    await prisma.surpriseConfig.createMany({
      data: missing.map((type) => ({ guildId, type })),
      skipDuplicates: true,
    });
  }

  const configs = await prisma.surpriseConfig.findMany({ where: { guildId }, orderBy: { type: "asc" } });
  res.json({ configs });
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  channelId: z.string().nullable().optional(),
  reward: z.string().nullable().optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
});

// PATCH /api/guilds/:guildId/surprises/:type
export async function updateSurprise(req: AuthedRequest, res: Response) {
  const { guildId, type } = req.params;
  const typeParsed = surpriseTypeSchema.safeParse(type);
  if (!typeParsed.success) return res.status(400).json({ error: "INVALID_TYPE" });

  const bodyParsed = updateSchema.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: "INVALID_BODY", details: bodyParsed.error.flatten() });

  const config = await prisma.surpriseConfig.upsert({
    where: { guildId_type: { guildId, type: typeParsed.data } },
    create: { guildId, type: typeParsed.data, ...bodyParsed.data },
    update: bodyParsed.data,
  });

  res.json({ config });
}

// GET /api/guilds/:guildId/surprises/events — последние сработавшие события
export async function listSurpriseEvents(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const events = await prisma.surpriseEvent.findMany({
    where: { guildId },
    orderBy: { triggeredAt: "desc" },
    take: 50,
  });
  res.json({ events });
}
