import { Message } from "discord.js";
import { prisma } from "@horizon/database";
import { bumpAnalytics } from "../lib/analytics";

/**
 * ВАЖНО: мы намеренно НЕ читаем message.content — для этого нужен privileged
 * intent MessageContent, а он не требуется для простого подсчёта сообщений
 * (событие messageCreate прилетает и без него). Это сознательное решение:
 * меньше privileged intents = проще пройти верификацию у Discord при росте
 * бота за 100+ серверов, и меньше данных пользователей мы вообще видим.
 */
export async function onMessageCreate(message: Message) {
  if (!message.guild || message.author.bot) return;

  await prisma.guildMember
    .upsert({
      where: { guildId_discordId: { guildId: message.guild.id, discordId: message.author.id } },
      create: {
        guildId: message.guild.id,
        discordId: message.author.id,
        username: message.author.username,
        avatar: message.author.avatar,
        messageCount: 1,
      },
      update: { messageCount: { increment: 1 } },
    })
    .catch((err: unknown) => console.error("Не удалось обновить messageCount:", err));

  await bumpAnalytics(message.guild.id, "messageCount");
}
