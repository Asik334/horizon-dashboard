import { Client, TextChannel } from "discord.js";
import { prisma } from "@horizon/database";

const CHECK_INTERVAL_MS = 60 * 1000; // проверяем раз в минуту
// probability в конфиге — это "% шанс за час". Пересчитываем в шанс на один
// тик проверки, чтобы при любом интервале проверки среднее совпадало.
const TICKS_PER_HOUR = (60 * 60 * 1000) / CHECK_INTERVAL_MS;

const rewardMessages: Record<string, (reward: string | null) => string> = {
  RANDOM_REWARD: (r) => `🎁 Внезапный подарок для сервера! ${r ? `Награда: ${r}` : "Кому-то сегодня повезёт."}`,
  RANDOM_EVENT: () => `🎉 На сервере начинается случайное событие! Загляните в чат.`,
  XP_BOOST: (r) => `⭐ Активирован XP Boost! ${r ?? "Общайтесь активнее — сейчас опыт начисляется быстрее."}`,
  ACTIVITY_CHALLENGE: (r) => `🔥 Activity Challenge начался! ${r ?? "Кто будет самым активным в ближайший час?"}`,
};

export function startSurprisesJob(client: Client<true>) {
  const tick = async () => {
    const configs = await prisma.surpriseConfig.findMany({ where: { enabled: true } });
    const currentHour = new Date().getUTCHours();

    for (const cfg of configs) {
      if (!cfg.channelId) continue;
      if (cfg.startHour != null && cfg.endHour != null) {
        const inWindow =
          cfg.startHour <= cfg.endHour
            ? currentHour >= cfg.startHour && currentHour <= cfg.endHour
            : currentHour >= cfg.startHour || currentHour <= cfg.endHour; // окно через полночь
        if (!inWindow) continue;
      }

      const chancePerTick = cfg.probability / 100 / TICKS_PER_HOUR;
      if (Math.random() >= chancePerTick) continue;

      try {
        const channel = await client.channels.fetch(cfg.channelId);
        if (!channel || !(channel instanceof TextChannel)) continue;

        const buildMessage = rewardMessages[cfg.type] ?? (() => "🎁 Surprise!");
        const text = buildMessage(cfg.reward);
        const sent = await channel.send(text);

        await prisma.surpriseEvent.create({
          data: {
            guildId: cfg.guildId,
            configId: cfg.id,
            type: cfg.type,
            channelId: cfg.channelId,
            details: { messageId: sent.id },
          },
        });
      } catch (err) {
        console.error(`Surprise (${cfg.type}) для гильдии ${cfg.guildId} не удалось отправить:`, err);
      }
    }
  };

  return setInterval(tick, CHECK_INTERVAL_MS);
}
