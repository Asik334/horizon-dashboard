import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN обязателен"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL обязателен"),
  ENABLE_PRESENCE_INTENT: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Некорректные переменные окружения бота:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
