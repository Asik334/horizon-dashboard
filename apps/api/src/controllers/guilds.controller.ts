import { Response } from "express";
import { prisma } from "@horizon/database";
import { AuthedRequest } from "../middleware/auth";
import {
  getDiscordUserGuilds,
  canManageGuild,
  discordBot,
} from "../lib/discord";
import { z } from "zod";

// GET /api/guilds — только сервера, где пользователь owner или имеет MANAGE_GUILD.
export async function listGuilds(req: AuthedRequest, res: Response) {
  try {
    const accessToken = req.user!.accessToken;

    if (!accessToken) {
      return res.status(401).json({
        error: "NO_DISCORD_TOKEN",
        message: "Discord access token отсутствует",
      });
    }

    // Получаем серверы пользователя через Discord OAuth
    const discordGuilds = await getDiscordUserGuilds(accessToken);

    // Оставляем только серверы, которыми пользователь может управлять
    const manageable = discordGuilds.filter(
      (g) => g.owner || canManageGuild(g.permissions)
    );

    // Проверяем каждый сервер через BOT TOKEN
    const result = await Promise.all(
      manageable.map(async (g) => {
        let botPresent = false;

        try {
          // Если бот находится на сервере — Discord вернёт 200
          await discordBot.getGuild(g.id);
          botPresent = true;
        } catch (error: any) {
          // Если бот не находится на сервере — Discord обычно вернёт 404
          botPresent = false;

          console.log(
            `[Guilds] Bot not present: ${g.name} (${g.id})`,
            error?.response?.status
          );
        }

        // Данные из нашей БД
        const dbGuild = await prisma.guild.findUnique({
          where: { id: g.id },
        });

        return {
          id: g.id,
          name: g.name,
          icon: g.icon,

          // ВАЖНО: теперь это реальная проверка Discord Bot Token
          botPresent,

          // Если бот уже работал с сервером — берём статистику из БД
          memberCount: dbGuild?.memberCount ?? 0,
          onlineCount: dbGuild?.onlineCount ?? 0,
        };
      })
    );

    return res.json({ guilds: result });
  } catch (error: any) {
    console.error("[Guilds] Failed to load guilds:", error);

    return res.status(500).json({
      error: "GUILDS_FETCH_FAILED",
      message: "Не удалось получить список серверов",
    });
  }
}

// GET /api/guilds/:guildId — доступ уже проверен requireGuildAccess.
export async function getGuild(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return res.status(404).json({ error: "GUILD_NOT_FOUND", message: "Бот ещё не был на этом сервере" });
  res.json({ guild });
}

const membersQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["joinedAt", "messageCount", "username"]).default("joinedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

// GET /api/guilds/:guildId/members
export async function getGuildMembers(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = membersQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_QUERY", details: parsed.error.flatten() });

  const { search, page, pageSize, sortBy, sortDir } = parsed.data;

  const where = {
    guildId,
    ...(search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { displayName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [members, total] = await Promise.all([
    prisma.guildMember.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { warnings: true } } },
    }),
    prisma.guildMember.count({ where }),
  ]);

  res.json({ members, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

// GET /api/guilds/:guildId/members/:memberId/history — timeline пользователя
export async function getMemberHistory(req: AuthedRequest, res: Response) {
  const { guildId, memberId } = req.params;
  const member = await prisma.guildMember.findFirst({ where: { id: memberId, guildId } });
  if (!member) return res.status(404).json({ error: "MEMBER_NOT_FOUND" });

  const [warnings, moderationLogs] = await Promise.all([
    prisma.warning.findMany({ where: { memberId }, orderBy: { createdAt: "desc" } }),
    prisma.moderationLog.findMany({
      where: { targetMemberId: memberId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  res.json({ member, warnings, moderationLogs });
}

// GET /api/guilds/:guildId/settings
export async function getGuildSettings(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId },
    update: {},
  });
  res.json({ settings });
}

const settingsUpdateSchema = z.object({
  language: z.string().optional(),
  timezone: z.string().optional(),
  welcomeEnabled: z.boolean().optional(),
  welcomeChannelId: z.string().nullable().optional(),
  welcomeMessage: z.string().nullable().optional(),
  autoRoleId: z.string().nullable().optional(),
  antiSpam: z.boolean().optional(),
  antiLink: z.boolean().optional(),
  antiRaid: z.boolean().optional(),
  toxicityDetection: z.boolean().optional(),
  autoModeration: z.boolean().optional(),
  aiAnalysisEnabled: z.boolean().optional(),
  aiModerationEnabled: z.boolean().optional(),
  aiRecommendations: z.boolean().optional(),
  voiceTempChannels: z.boolean().optional(),
  voiceAutoCleanup: z.boolean().optional(),
  voiceDefaultLimit: z.number().int().min(0).max(99).optional(),
});

// PATCH /api/guilds/:guildId/settings
export async function updateGuildSettings(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_BODY", details: parsed.error.flatten() });

  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, ...parsed.data },
    update: parsed.data,
  });

  await prisma.auditLog.create({
    data: {
      guildId,
      type: "BOT_ACTION",
      dashboardUserId: req.user!.id,
      actorName: req.user!.username,
      description: "Настройки сервера обновлены через Dashboard",
      metadata: parsed.data,
    },
  });

  res.json({ settings });
}

// GET /api/guilds/:guildId/voice
export async function getGuildVoice(req: AuthedRequest, res: Response) {
  const { guildId } = req.params;
  const activeSessions = await prisma.voiceSession.findMany({
    where: { guildId, leftAt: null },
  });

  const byChannel = new Map<string, { channelId: string; channelName: string; users: number }>();
  for (const s of activeSessions) {
    const cur = byChannel.get(s.channelId) ?? { channelId: s.channelId, channelName: s.channelName, users: 0 };
    cur.users += 1;
    byChannel.set(s.channelId, cur);
  }

  res.json({ channels: Array.from(byChannel.values()) });
}
