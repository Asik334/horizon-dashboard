import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL обязателен"),

  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_REDIRECT_URI: z.string().url(),
  DISCORD_BOT_TOKEN: z.string().min(1),

  JWT_SECRET: z.string().min(32, "JWT_SECRET должен быть длиннее 32 символов"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().optional(),

  // Stripe — оплата за вход в турниры.
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY обязателен"),
  // Секрет для проверки подписи вебхука (stripe listen / Dashboard → Webhooks).
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET обязателен"),
});

// Fail-fast: если конфигурация невалидна, сервер не должен подниматься вовсе —
// лучше явная ошибка при старте, чем скрытая уязвимость в рантайме.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Некорректные переменные окружения:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
