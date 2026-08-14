import { Client } from "discord.js";
import { snapshotGuildCounts } from "../lib/analytics";

const INTERVAL_MS = 15 * 60 * 1000; // раз в 15 минут достаточно для графиков за 24ч/7д

export function startPeriodicSnapshot(client: Client<true>) {
  const tick = async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        // Без Presence Intent guild.presences.cache будет пустым — тогда просто
        // сохраняем 0 и это видно на графике честно, а не выдумываем число.
        const onlineCount = guild.presences.cache.filter((p) => p.status !== "offline").size;
        await snapshotGuildCounts(guild.id, guild.memberCount, onlineCount);
      } catch (err) {
        console.error(`Не удалось сделать снапшот для гильдии ${guild.id}:`, err);
      }
    }
  };

  tick(); // первый снапшот сразу, не дожидаясь первого интервала
  return setInterval(tick, INTERVAL_MS);
}
