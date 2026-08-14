import { Request, Response, NextFunction } from "express";
import { prisma } from "@horizon/database";
import { verifySessionToken } from "../lib/jwt";

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    discordId: string;
    username: string;
    avatar: string | null;
    accessToken: string | null;
  };
}

export const SESSION_COOKIE = "horizon_session";

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Требуется вход через Discord" });
    }

    const payload = verifySessionToken(token);

    // Проверяем, что сессия не была отозвана (logout / удаление) и не истекла.
    const session = await prisma.session.findUnique({ where: { jwtId: payload.jti } });
    if (!session || session.expiresAt < new Date()) {
      res.clearCookie(SESSION_COOKIE);
      return res.status(401).json({ error: "SESSION_EXPIRED", message: "Сессия истекла, войдите снова" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    req.user = {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar,
      accessToken: user.accessToken,
    };
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN", message: "Невалидный или истёкший токен" });
  }
}
