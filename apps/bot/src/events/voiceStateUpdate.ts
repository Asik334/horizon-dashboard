import { VoiceState } from "discord.js";
import { prisma } from "@horizon/database";
import { bumpAnalytics } from "../lib/analytics";

async function closeOpenSession(guildId: string, discordId: string) {
  const open = await prisma.voiceSession.findFirst({
    where: { guildId, discordId, leftAt: null },
    orderBy: { joinedAt: "desc" },
  });
  if (!open) return;

  const leftAt = new Date();
  const durationSec = Math.max(0, Math.round((leftAt.getTime() - new Date(open.joinedAt).getTime()) / 1000));

  await prisma.voiceSession.update({
    where: { id: open.id },
    data: { leftAt, durationSec },
  });

  if (durationSec > 0) {
    await bumpAnalytics(guildId, "voiceMinutes", Math.round(durationSec / 60));
  }
}

export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  const guildId = newState.guild.id;
  const discordId = newState.id;

  const leftChannel = oldState.channelId && oldState.channelId !== newState.channelId;
  const joinedChannel = newState.channelId && oldState.channelId !== newState.channelId;

  if (leftChannel) {
    await closeOpenSession(guildId, discordId);
  }

  if (joinedChannel && newState.channel) {
    await prisma.voiceSession.create({
      data: {
        guildId,
        channelId: newState.channel.id,
        channelName: newState.channel.name,
        discordId,
        joinedAt: new Date(),
      },
    });
  }
}
