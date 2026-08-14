import { Guild } from "discord.js";
import { prisma } from "@horizon/database";
import { syncGuildRecord } from "../lib/syncGuild";

export async function onGuildCreate(guild: Guild) {
  console.log(`➕ Бот добавлен на сервер: ${guild.name} (${guild.id})`);
  await syncGuildRecord(guild, true);
  await prisma.auditLog.create({
    data: {
      guildId: guild.id,
      type: "BOT_ACTION",
      description: "Horizon Bot добавлен на сервер",
    },
  });
}
