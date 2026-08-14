import { Client } from "discord.js";
import { syncGuildRecord } from "../lib/syncGuild";
import { snapshotGuildCounts } from "../lib/analytics";

export async function onReady(client: Client<true>) {
  console.log(`🤖 Horizon Bot вошёл как ${client.user.tag}, серверов: ${client.guilds.cache.size}`);

  for (const guild of client.guilds.cache.values()) {
    try {
      // memberCount из кэша гильдии доступен сразу без доп. запросов (approximate presence count
      // требует fetch), берём то, что даёт Gateway READY payload.
      await syncGuildRecord(guild, true);
      await snapshotGuildCounts(guild.id, guild.memberCount, guild.approximatePresenceCount ?? 0);
    } catch (err) {
      console.error(`Не удалось синхронизировать гильдию ${guild.id} при старте:`, err);
    }
  }
}
