import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./lib/env";
import { authRouter } from "./routes/auth.routes";
import { guildsRouter } from "./routes/guilds.routes";
import { tournamentPublicRouter } from "./routes/tournamentPublic.routes";
import { stripeWebhook } from "./controllers/tournamentPublic.controller";
import { initWebSocketServer } from "./ws";

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  env.WEB_APP_URL,
  "https://horizon-dashboard-production-171b.up.railway.app",
].filter(Boolean);

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      // Разрешаем запросы без Origin
      // (например, health-check или серверные запросы)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(cookieParser());

// Stripe webhook ДОЛЖЕН стоять до express.json(): Stripe проверяет подпись
// по «сырым» байтам тела запроса (constructWebhookEvent), распарсенный и
// заново сериализованный JSON даст другую подпись и запрос будет отклонён.
// Роут не требует auth — источник запроса аутентифицируется по HMAC-подписи
// в заголовке stripe-signature, а не по cookie сессии.
app.post("/api/tournaments/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const moderationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMITED",
    message: "Слишком много модерационных действий, подождите",
  },
});

app.use("/api/guilds/:guildId/moderation", moderationLimiter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    ts: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);
app.use("/api/guilds", guildsRouter);
app.use("/api/tournaments", tournamentPublicRouter);

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);

    res.status(err.status ?? 500).json({
      error: err.code ?? "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "development"
          ? err.message
          : "Внутренняя ошибка сервера",
    });
  }
);

const server = http.createServer(app);

initWebSocketServer(server);

server.listen(Number(env.PORT), () => {
  console.log(
    `🚀 Horizon Dashboard API запущен на порту ${env.PORT} (${env.NODE_ENV})`
  );

  console.log("Allowed CORS origins:", allowedOrigins);
});