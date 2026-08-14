import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";
import { getDiscordUserGuilds, canManageGuild, DiscordUserGuild, refreshDiscordToken } from "../lib/discord";
import { prisma } from "@horizon/database";

// Простой in-memory TTL-кэш "какие гильдии пользователь может администрировать",
// чтобы не дёргать Discord API на каждый запрос. Для multi-instance деплоя
// замените на Redis (тот же интерфейс get/set с TTL).
const guildAccessCache = new Map<string, { guilds: Map<string, DiscordUserGuild>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getManageableGuilds(userId: string): Promise<Map<string, DiscordUserGuild>> {
  const cached = guildAccessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.guilds;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.accessToken) return new Map();

  try {
    const guilds = await getDiscordUserGuilds(user.accessToken);
    const manageable = new Map(
      guilds.filter((g) => g.owner || canManageGuild(g.permissions)).map((g) => [g.id, g])
    );
    guildAccessCache.set(userId, { guilds: manageable, expiresAt: Date.now() + CACHE_TTL_MS });
    return manageable;
  } catch (err: any) {
    // Токен истёк — пробуем обновить один раз через refresh_token.
    if (err?.response?.status === 401 && user.refreshToken) {
      const refreshed = await refreshDiscordToken(user.refreshToken);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        },
      });
      const guilds = await getDiscordUserGuilds(refreshed.access_token);
      const manageable = new Map(
        guilds.filter((g) => g.owner || canManageGuild(g.permissions)).map((g) => [g.id, g])
      );
      guildAccessCache.set(userId, { guilds: manageable, expiresAt: Date.now() + CACHE_TTL_MS });
      return manageable;
    }
    throw err;
  }
}

/**
 * Гарантирует, что в БД есть строка Guild, прежде чем любой guild-scoped
 * роут попытается создать дочернюю запись (GuildSettings/GuildMember/
 * ModerationLog и т.д. — все они ссылаются на Guild(id) внешним ключом).
 *
 * В нормальной архитектуре эту строку создаёт сам Discord-бот при событии
 * guildCreate. Но Dashboard не должен зависеть от того, успел ли бот это
 * сделать: пользователь может открыть Settings до первого события бота,
 * и тогда upsert без существующего родителя упадёт с P2003 (foreign key
 * constraint violation). Здесь мы страхуемся минимальной записью на
 * основе данных, которые уже получили из Discord OAuth (`/users/@me/guilds`).
 * Как только реальный бот подключится и обработает guildCreate — он
 * перезапишет botPresent/memberCount актуальными значениями через свой
 * собственный upsert, эта заготовка ничего не потеряет.
 */
async function ensureGuildRecord(guildId: string, discordGuild: DiscordUserGuild, ownerDiscordId: string) {
  await prisma.guild.upsert({
    where: { id: guildId },
    create: {
      id: guildId,
      name: discordGuild.name,
      icon: discordGuild.icon,
      // Реальный owner_id сервера не приходит из /users/@me/guilds (только
      // флаг "owner ли я"), точное значение подставит бот при первом
      // guildCreate. Пока используем best-effort: текущий пользователь,
      // если он владелец, иначе placeholder.
      ownerId: discordGuild.owner ? ownerDiscordId : "unknown",
    },
    update: {
      // Не трогаем botPresent/memberCount/onlineCount — это домен бота.
      name: discordGuild.name,
      icon: discordGuild.icon,
    },
  });
}

/**
 * КРИТИЧНО ДЛЯ БЕЗОПАСНОСТИ: guildId из URL никогда не считается доверенным.
 * Здесь мы всегда сверяем его со списком гильдий, которыми пользователь
 * реально управляет по данным Discord (owner или MANAGE_GUILD/ADMINISTRATOR).
 * Без этой проверки пользователь мог бы открыть /api/guilds/<чужой-id>/... и
 * получить доступ к чужому серверу простой подменой URL.
 */
export async function requireGuildAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { guildId } = req.params;
    if (!guildId) return res.status(400).json({ error: "GUILD_ID_REQUIRED" });
    if (!req.user) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const manageableGuilds = await getManageableGuilds(req.user.id);
    const discordGuild = manageableGuilds.get(guildId);

    if (!discordGuild) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "У вас нет прав администратора на этом сервере",
      });
    }

    await ensureGuildRecord(guildId, discordGuild, req.user.discordId);

    next();
  } catch (err) {
    next(err);
  }
}

export function invalidateGuildAccessCache(userId: string) {
  guildAccessCache.delete(userId);
}
