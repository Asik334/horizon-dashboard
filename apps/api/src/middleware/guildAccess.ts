import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";
import {
  getDiscordUserGuilds,
  canManageGuild,
  DiscordUserGuild,
  refreshDiscordToken,
} from "../lib/discord";
import { prisma } from "@horizon/database";

type GuildCacheEntry = {
  guilds: Map<string, DiscordUserGuild>;
  expiresAt: number;
};

const guildAccessCache = new Map<string, GuildCacheEntry>();

// Было 60 секунд.
// Увеличиваем до 5 минут, чтобы не спамить Discord API.
const CACHE_TTL_MS = 5 * 60_000;

// Если Discord дал 429, не пытаемся снова каждую миллисекунду.
const RATE_LIMIT_COOLDOWN_MS = 30_000;

const guildRateLimitCache = new Map<string, number>();

async function getManageableGuilds(
  userId: string
): Promise<Map<string, DiscordUserGuild>> {
  const now = Date.now();

  // 1. Обычный cache
  const cached = guildAccessCache.get(userId);

  if (cached && cached.expiresAt > now) {
    return cached.guilds;
  }

  // 2. Если недавно получили 429 — используем старый cache,
  // если он существует, и НЕ идём снова в Discord.
  const rateLimitedUntil = guildRateLimitCache.get(userId);

  if (rateLimitedUntil && rateLimitedUntil > now) {
    if (cached) {
      return cached.guilds;
    }

    throw Object.assign(
      new Error("Discord API rate limit"),
      {
        status: 429,
        response: {
          status: 429,
        },
      }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user?.accessToken) {
    return new Map();
  }

  try {
    const guilds = await getDiscordUserGuilds(user.accessToken);

    const manageable = new Map(
      guilds
        .filter(
          (guild) =>
            guild.owner || canManageGuild(guild.permissions)
        )
        .map((guild) => [guild.id, guild])
    );

    guildAccessCache.set(userId, {
      guilds: manageable,
      expiresAt: now + CACHE_TTL_MS,
    });

    // Успешный запрос — снимаем rate-limit cooldown.
    guildRateLimitCache.delete(userId);

    return manageable;
  } catch (err: any) {
    const status = err?.response?.status;

    // Discord 429
    if (status === 429) {
      guildRateLimitCache.set(
        userId,
        Date.now() + RATE_LIMIT_COOLDOWN_MS
      );

      // Если есть старый cache — продолжаем работать с ним.
      if (cached) {
        return cached.guilds;
      }

      throw err;
    }

    // Access token истёк.
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
              Date.now() + refreshed.expires_in * 1000
            ),
          },
        });

        const guilds = await getDiscordUserGuilds(
          refreshed.access_token
        );

        const manageable = new Map(
          guilds
            .filter(
              (guild) =>
                guild.owner ||
                canManageGuild(guild.permissions)
            )
            .map((guild) => [guild.id, guild])
        );

        guildAccessCache.set(userId, {
          guilds: manageable,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        guildRateLimitCache.delete(userId);

        return manageable;
      } catch (refreshError: any) {
        // Если повторно получили 429 — не продолжаем цикл.
        if (refreshError?.response?.status === 429) {
          guildRateLimitCache.set(
            userId,
            Date.now() + RATE_LIMIT_COOLDOWN_MS
          );

          if (cached) {
            return cached.guilds;
          }
        }

        throw refreshError;
      }
    }

    throw err;
  }
}

/**
 * Создаёт Guild в БД, если его ещё нет.
 */
async function ensureGuildRecord(
  guildId: string,
  discordGuild: DiscordUserGuild,
  ownerDiscordId: string
) {
  await prisma.guild.upsert({
    where: {
      id: guildId,
    },

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

/**
 * Проверяет, имеет ли пользователь права управления сервером.
 */
export async function requireGuildAccess(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({
        error: "GUILD_ID_REQUIRED",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: "UNAUTHENTICATED",
      });
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
  } catch (err: any) {
    console.error(
      "[GuildAccess] Error:",
      err?.response?.status || err?.status || err?.message || err
    );

    if (err?.response?.status === 429 || err?.status === 429) {
      return res.status(429).json({
        error: "DISCORD_RATE_LIMIT",
        message:
          "Discord временно ограничил запросы. Повторите через несколько секунд.",
      });
    }

    next(err);
  }
}

/**
 * Вызывай после logout / повторной авторизации,
 * если нужно принудительно обновить список серверов.
 */
export function invalidateGuildAccessCache(
  userId: string
) {
  guildAccessCache.delete(userId);
  guildRateLimitCache.delete(userId);
}