import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";
import {
  getDiscordUserGuilds,
  canManageGuild,
  DiscordUserGuild,
  refreshDiscordToken,
} from "../lib/discord";
import { prisma } from "@horizon/database";

const guildAccessCache = new Map<
  string,
  {
    guilds: Map<string, DiscordUserGuild>;
    expiresAt: number;
  }
>();

// Не допускаем несколько одновременных запросов Discord
const guildAccessInflight = new Map<
  string,
  Promise<Map<string, DiscordUserGuild>>
>();

// Защита от Discord 429
const guildAccessRateLimit = new Map<
  string,
  {
    retryAt: number;
  }
>();

const CACHE_TTL_MS = 60_000;

async function getManageableGuilds(
  userId: string
): Promise<Map<string, DiscordUserGuild>> {
  // 1. Используем действующий cache
  const cached = guildAccessCache.get(userId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.guilds;
  }

  // 2. Если такой запрос уже выполняется,
  // используем его результат вместо нового запроса Discord
  const existingRequest = guildAccessInflight.get(userId);

  if (existingRequest) {
    return existingRequest;
  }

  // 3. Если Discord недавно вернул 429,
  // не отправляем новые запросы
  const rateLimit = guildAccessRateLimit.get(userId);

  if (rateLimit && rateLimit.retryAt > Date.now()) {
    if (cached) {
      return cached.guilds;
    }

    return new Map();
  }

  const request = (async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.accessToken) {
      return new Map<string, DiscordUserGuild>();
    }

    try {
      const guilds = await getDiscordUserGuilds(user.accessToken);

      const manageable = new Map(
        guilds
          .filter(
            (g) =>
              g.owner ||
              canManageGuild(g.permissions)
          )
          .map((g) => [g.id, g])
      );

      guildAccessCache.set(userId, {
        guilds: manageable,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      guildAccessRateLimit.delete(userId);

      return manageable;
    } catch (err: any) {
      const status = err?.response?.status;

      console.error("[Discord Guilds]", {
        status,
        data: err?.response?.data,
        userId,
      });

      // Discord rate limit
      if (status === 429) {
        const retryAfter =
          Number(err?.response?.data?.retry_after) || 5;

        guildAccessRateLimit.set(userId, {
          retryAt: Date.now() + retryAfter * 1000,
        });

        // Если есть старый cache — используем его
        if (cached) {
          return cached.guilds;
        }

        return new Map();
      }

      // OAuth access token истёк
      if (status === 401 && user.refreshToken) {
        try {
          const refreshed = await refreshDiscordToken(
            user.refreshToken
          );

          await prisma.user.update({
            where: { id: userId },
            data: {
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              tokenExpiresAt: new Date(
                Date.now() +
                  refreshed.expires_in * 1000
              ),
            },
          });

          const guilds = await getDiscordUserGuilds(
            refreshed.access_token
          );

          const manageable = new Map(
            guilds
              .filter(
                (g) =>
                  g.owner ||
                  canManageGuild(g.permissions)
              )
              .map((g) => [g.id, g])
          );

          guildAccessCache.set(userId, {
            guilds: manageable,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          return manageable;
        } catch (refreshErr: any) {
          console.error(
            "[Discord Token Refresh]",
            refreshErr?.response?.data ||
              refreshErr?.message
          );

          return cached?.guilds || new Map();
        }
      }

      throw err;
    }
  })();

  guildAccessInflight.set(userId, request);

  try {
    return await request;
  } finally {
    guildAccessInflight.delete(userId);
  }
}

async function ensureGuildRecord(
  guildId: string,
  discordGuild: DiscordUserGuild,
  ownerDiscordId: string
) {
  await prisma.guild.upsert({
    where: { id: guildId },
    create: {
      id: guildId,
      name: discordGuild.name,
      icon: discordGuild.icon,
      ownerId: discordGuild.owner
        ? ownerDiscordId
        : "unknown",
    },
    update: {
      name: discordGuild.name,
      icon: discordGuild.icon,
    },
  });
}

export async function requireGuildAccess(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res
        .status(400)
        .json({ error: "GUILD_ID_REQUIRED" });
    }

    if (!req.user) {
      return res
        .status(401)
        .json({ error: "UNAUTHENTICATED" });
    }

    const manageableGuilds =
      await getManageableGuilds(req.user.id);

    const discordGuild =
      manageableGuilds.get(guildId);

    if (!discordGuild) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message:
          "У вас нет прав администратора на этом сервере",
      });
    }

    await ensureGuildRecord(
      guildId,
      discordGuild,
      req.user.discordId
    );

    next();
  } catch (err) {
    next(err);
  }
}

export function invalidateGuildAccessCache(
  userId: string
) {
  guildAccessCache.delete(userId);
  guildAccessInflight.delete(userId);
  guildAccessRateLimit.delete(userId);
}