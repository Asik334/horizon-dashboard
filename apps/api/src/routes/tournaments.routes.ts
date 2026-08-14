import { Router } from "express";
import * as tournaments from "../controllers/tournaments.controller";

// Монтируется в guilds.routes.ts под /:guildId/tournaments — requireAuth и
// requireGuildAccess уже применены родительским роутером.
export const tournamentsAdminRouter = Router({ mergeParams: true });

tournamentsAdminRouter.get("/", tournaments.listTournaments);
tournamentsAdminRouter.post("/", tournaments.createTournament);
tournamentsAdminRouter.get("/:id", tournaments.getTournamentAdmin);
tournamentsAdminRouter.post("/:id/open-registration", tournaments.openRegistration);
tournamentsAdminRouter.post("/:id/close-registration", tournaments.closeRegistrationAndGenerateBracket);
tournamentsAdminRouter.post("/:id/matches/:matchId/result", tournaments.reportMatchResult);
tournamentsAdminRouter.post("/:id/cancel", tournaments.cancelTournament);
