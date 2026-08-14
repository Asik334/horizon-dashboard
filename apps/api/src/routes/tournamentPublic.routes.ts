import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import * as pub from "../controllers/tournamentPublic.controller";

// Смонтирован в index.ts как /api/tournaments. requireAuth здесь — это
// "вы вошли через Discord на дэшборде", НЕ "вы админ этой гильдии" —
// намеренно отдельный от guildsRouter путь, см. комментарий в контроллере.
export const tournamentPublicRouter = Router();

tournamentPublicRouter.use(requireAuth);

tournamentPublicRouter.get("/:guildId", pub.listPublicTournaments);
tournamentPublicRouter.get("/:guildId/:id", pub.getPublicTournament);
tournamentPublicRouter.post("/:guildId/:id/join", pub.joinTournament);
