import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";
import {
  getDiscordUserGuilds,
  canManageGuild,
  DiscordUserGuild,
  refreshDiscordToken,
} from "../lib/discord";
import { prisma } from "@horizon/database";

/**
 * Кэш доступных пользователю Discord-серверов.
 *
 * Это позволяет не обращаться к Discord API на каждый запрос.
 */
const guildAccessCache = new Map<
  string,
  {
    guilds: Map<string, DiscordUserGuild>;
    expiresAt: number;
  }
>();

/**
 * Защита от нескольких одновременных запросов.
 *
 * Если одновременно приходит 10 запросов от одного пользователя,
 * Discord получит только ОДИН запрос /users/@me/guilds.
 */
const guildAccessInflight = new Map<
  string,
  Promise<Map<string, DiscordUserGuild>>
>();

/**
 * Защита от Discord 429.
 *
 * Если Discord сказал "слишком много запросов",
 * некоторое время вообще не обращаемся к Discord.
 */
const guildAccessRateLimit = new Map<
  string,
  {
    retryAt: number;
  }
>();

/**
 * Кэшируем доступ пользователя на 60 секунд.
 */
const CACHE_TTL_MS = 60_000;

/**
 * Получить список серверов Discord,
 * которыми пользователь может управлять.
 */
async function getManageableGuilds(
  userId: string
): Promise<Map<string, DiscordUserGuild>> {
  /**
   * 1. Сначала проверяем обычный кэш.
   */
  const cached = guildAccessCache.get(userId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.guilds;
  }

  /**
   * 2. Проверяем, не выполняется ли уже такой запрос.
   *
   * Это очень важно для защиты от 429.
   */
  const existingRequest = guildAccessInflight.get(userId);

  if (existingRequest) {
    return existingRequest;
  }

  /**
   * 3. Проверяем временный rate-limit.
   *
   * Если Discord недавно вернул 429,
   * не отправляем новый запрос.
   */
  const rateLimit = guildAccessRateLimit.get(userId);

  if (rateLimit && rateLimit.retryAt > Date.now()) {
    /**
     * Если есть старый кэш — используем его.
     */
    if (cached) {
      return cached.guilds;
    }

    /**
     * Если старого кэша нет,
     * возвращаем пустой список.
     */
    return new Map<string, DiscordUserGuild>();
  }

  /**
   * 4. Создаём один общий Promise.
   */
  const request = (async () => {
    /**
     * Получаем пользователя из БД.
     */
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user?.accessToken) {
      return new Map<string, DiscordUserGuild>();
    }

    try {
      /**
       * Получаем серверы пользователя из Discord.
       */
      const guilds = await getDiscordUserGuilds(
        user.accessToken
      );

      /**
       * Оставляем только серверы,
       * где пользователь владелец или имеет необходимые права.
       */
      const manageable = new Map(
        guilds
          .filter(
            (guild) =>
              guild.owner ||
              canManageGuild(guild.permissions)
          )
          .map((guild) => [guild.id, guild])
      );

      /**
       * Сохраняем результат в кэш.
       */
      guildAccessCache.set(userId, {
        guilds: manageable,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      /**
       * Discord снова отвечает нормально.
       * Удаляем старый rate-limit.
       */
      guildAccessRateLimit.delete(userId);

      return manageable;
    } catch (err: any) {
      const status = err?.response?.status;

      /**
       * Логируем только полезную информацию,
       * а не весь огромный AxiosError.
       */
      console.error("[Discord Guilds]", {
        status,
        data: err?.response?.data,
        userId,
      });

      /**
       * ==========================================
       * DISCORD 429
       * ==========================================
       */
      if (status === 429) {
        const retryAfter =
          Number(err?.response?.data?.retry_after) || 5;

        guildAccessRateLimit.set(userId, {
          retryAt: Date.now() + retryAfter * 1000,
        });

        /**
         * Если есть старый кэш,
         * продолжаем работать с ним.
         */
        if (cached) {
          return cached.guilds;
        }

        /**
         * Иначе временно возвращаем пустой список.
         */
        return new Map<string, DiscordUserGuild>();
      }

      /**
       * ==========================================
       * ACCESS TOKEN EXPIRED
       * ==========================================
       */
      if (status === 401 && user.refreshToken) {
        try {
          /**
           * Обновляем Discord OAuth token.
           */
          const refreshed = await refreshDiscordToken(
            user.refreshToken
          );

          /**
           * Сохраняем новые токены в БД.
           */
          await prisma.user.update({
            where: {
              id: userId,
            },
            data: {
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              tokenExpiresAt: new Date(
                Date.now() +
                  refreshed.expires_in * 1000
              ),
            },
          });

          /**
           * Повторяем запрос уже с новым токеном.
           */
          const guilds =
            await getDiscordUserGuilds(
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

          /**
           * Сохраняем новый результат.
           */
          guildAccessCache.set(userId, {
            guilds: manageable,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          /**
           * Сбрасываем rate-limit.
           */
          guildAccessRateLimit.delete(userId);

          return manageable;
        } catch (refreshErr: any) {
          console.error(
            "[Discord Token Refresh]",
            refreshErr?.response?.data ||
              refreshErr?.message
          );

          /**
           * Если обновление токена не удалось,
           * используем старый кэш, если он существует.
           */
          return (
            cached?.guilds ||
            new Map<string, DiscordUserGuild>()
          );
        }
      }

      /**
       * Остальные ошибки передаём дальше.
       */
      throw err;
    }
  })();

  /**
   * Сохраняем выполняющийся запрос.
   */
  guildAccessInflight.set(userId, request);

  try {
    return await request;
  } finally {
    /**
     * После завершения запроса удаляем его из inflight.
     */
    guildAccessInflight.delete(userId);
  }
}

/**
 * Гарантирует, что Guild существует в БД.
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
 * Middleware проверки доступа к Discord-серверу.
 */
export async function requireGuildAccess(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { guildId } = req.params;

    /**
     * Проверяем guildId.
     */
    if (!guildId) {
      return res.status(400).json({
        error: "GUILD_ID_REQUIRED",
      });
    }

    /**
     * Проверяем авторизацию пользователя.
     */
    if (!req.user) {
      return res.status(401).json({
        error: "UNAUTHENTICATED",
      });
    }

    /**
     * Получаем доступные пользователю серверы.
     */
    const manageableGuilds =
      await getManageableGuilds(req.user.id);

    /**
     * Ищем нужный сервер.
     */
    const discordGuild =
      manageableGuilds.get(guildId);

    /**
     * Если пользователь не имеет доступа —
     * запрещаем запрос.
     */
    if (!discordGuild) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message:
          "У вас нет прав администратора на этом сервере",
      });
    }

    /**
     * Гарантируем наличие Guild в БД.
     */
    await ensureGuildRecord(
      guildId,
      discordGuild,
      req.user.discordId
    );

    /**
     * Всё хорошо — продолжаем выполнение route.
     */
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Полностью очищает кэш пользователя.
 */
export function invalidateGuildAccessCache(
  userId: string
) {
  guildAccessCache.delete(userId);
  guildAccessInflight.delete(userId);
  guildAccessRateLimit.delete(userId);
}