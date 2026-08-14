import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireGuildAccess } from "../middleware/guildAccess";
import * as guilds from "../controllers/guilds.controller";
import * as moderation from "../controllers/moderation.controller";
import * as analytics from "../controllers/analytics.controller";
import * as surprises from "../controllers/surprises.controller";
import { tournamentsAdminRouter } from "./tournaments.routes";

export const guildsRouter = Router();

// Все роуты требуют аутентификации.
guildsRouter.use(requireAuth);

// Список серверов пользователя — доступ к самому списку не требует requireGuildAccess,
// т.к. он сам вычисляет доступные сервера из Discord.
guildsRouter.get("/", guilds.listGuilds);

// Дальше — все роуты привязаны к :guildId и ОБЯЗАТЕЛЬНО проходят requireGuildAccess,
// который проверяет, что пользователь реально администрирует этот сервер в Discord.
guildsRouter.use("/:guildId", requireGuildAccess);

guildsRouter.get("/:guildId", guilds.getGuild);
guildsRouter.get("/:guildId/members", guilds.getGuildMembers);
guildsRouter.get("/:guildId/members/:memberId/history", guilds.getMemberHistory);

guildsRouter.get("/:guildId/settings", guilds.getGuildSettings);
guildsRouter.patch("/:guildId/settings", guilds.updateGuildSettings);

guildsRouter.get("/:guildId/voice", guilds.getGuildVoice);

guildsRouter.get("/:guildId/analytics", analytics.getAnalytics);
guildsRouter.get("/:guildId/ai-analysis", analytics.getAIAnalysis);
guildsRouter.get("/:guildId/logs", analytics.getAuditLogs);

guildsRouter.get("/:guildId/moderation/logs", moderation.getModerationLogs);
guildsRouter.post("/:guildId/moderation/warn", moderation.warnMember);
guildsRouter.post("/:guildId/moderation/timeout", moderation.timeoutMember);
guildsRouter.post("/:guildId/moderation/kick", moderation.kickMember);
guildsRouter.post("/:guildId/moderation/ban", moderation.banMember);
guildsRouter.post("/:guildId/moderation/unban", moderation.unbanMember);

guildsRouter.get("/:guildId/surprises", surprises.listSurprises);
guildsRouter.patch("/:guildId/surprises/:type", surprises.updateSurprise);
guildsRouter.get("/:guildId/surprises/events", surprises.listSurpriseEvents);

// Админские действия с турнирами (создать/анонсировать/сгенерировать сетку/
// зафиксировать результат/отменить) — требуют прав администратора гильдии,
// поэтому висят здесь, за requireGuildAccess. Регистрация с оплатой для
// обычных участников — отдельный публичный роут, см. tournamentPublic.routes.ts.
guildsRouter.use("/:guildId/tournaments", tournamentsAdminRouter);
