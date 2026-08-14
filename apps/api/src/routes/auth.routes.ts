import { Router } from "express";
import { randomBytes } from "crypto";
import { prisma } from "@horizon/database";
import {
  getDiscordAuthorizeUrl,
  exchangeDiscordCode,
  getDiscordUser,
} from "../lib/discord";
import { signSessionToken } from "../lib/jwt";
import { env, isProd } from "../lib/env";
import { requireAuth, AuthedRequest, SESSION_COOKIE } from "../middleware/auth";

export const authRouter = Router();

const STATE_COOKIE = "horizon_oauth_state";

const cookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: "none" as const,
};

// GET /auth/discord — редиректит на Discord OAuth2 authorize screen.
authRouter.get("/discord", (req, res) => {
  const state = randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, { ...cookieOpts, maxAge: 5 * 60 * 1000 });
  res.redirect(getDiscordAuthorizeUrl(state));
});

// GET /auth/discord/callback — обмен code на токены, upsert пользователя, выдача JWT-сессии.
authRouter.get("/discord/callback", async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const savedState = req.cookies?.[STATE_COOKIE];

    if (!code || !state || !savedState || state !== savedState) {
      return res.redirect(`${env.WEB_APP_URL}/login?error=invalid_state`);
    }
    res.clearCookie(STATE_COOKIE);

    const tokens = await exchangeDiscordCode(code);
    const discordUser = await getDiscordUser(tokens.access_token);

    // ВАЖНО: access/refresh токены Discord хранятся только на сервере (в БД),
    // и никогда не передаются во frontend.
    const user = await prisma.user.upsert({
      where: { discordId: discordUser.id },
      create: {
        discordId: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        globalName: discordUser.global_name,
        avatar: discordUser.avatar,
        email: discordUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        globalName: discordUser.global_name,
        avatar: discordUser.avatar,
        email: discordUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    const { token, jti } = signSessionToken({ sub: user.id, discordId: user.discordId });

    await prisma.session.create({
      data: {
        userId: user.id,
        jwtId: jti,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.cookie(SESSION_COOKIE, token, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect(`${env.WEB_APP_URL}/servers`);
  } catch (err) {
    console.error("Discord OAuth callback error:", err);
    res.redirect(`${env.WEB_APP_URL}/login?error=oauth_failed`);
  }
});

// GET /auth/me — данные текущего пользователя для фронта.
authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({
    id: req.user!.id,
    discordId: req.user!.discordId,
    username: req.user!.username,
    avatar: req.user!.avatar,
  });
});

// POST /logout — отзывает текущую сессию (удаляет из БД) и чистит cookie.
authRouter.post("/logout", requireAuth, async (req: AuthedRequest, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      const { verifySessionToken } = await import("../lib/jwt");
      const payload = verifySessionToken(token);
      await prisma.session.deleteMany({ where: { jwtId: payload.jti } });
    } catch {
      /* токен уже невалиден — просто чистим cookie */
    }
  }
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true });
});
