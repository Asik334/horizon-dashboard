import { Guild } from "discord.js";
import { prisma } from "@horizon/database";
import { markGuildBotAbsent } from "../lib/syncGuild";

export async function onGuildDelete(guild: Guild) {
  console.log(`➖ Бот удалён с сервера: ${guild.name} (${guild.id})`);
  await markGuildBotAbsent(guild.id);
  await prisma.auditLog
    .create({
      data: {
        guildId: guild.id,
        type: "BOT_ACTION",
        description: "Horizon Bot удалён с сервера",
      },
    })
    .catch(() => {});
}
