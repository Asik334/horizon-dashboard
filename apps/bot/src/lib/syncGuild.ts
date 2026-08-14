import { Guild as DiscordGuild } from "discord.js";
import { prisma } from "@horizon/database";

export async function syncGuildRecord(
  guild: DiscordGuild,
  botPresent: boolean
) {
  await prisma.guild.upsert({
    where: { id: guild.id },
    create: {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
      botPresent,
      memberCount: guild.memberCount,
    },
    update: {
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
      botPresent,
      memberCount: guild.memberCount,
    },
  });

  // Загружаем всех участников сервера
  const members = await guild.members.fetch();

  for (const member of members.values()) {
    await prisma.guildMember.upsert({
      where: {
        guildId_discordId: {
          guildId: guild.id,
          discordId: member.id,
        },
      },
      create: {
        guildId: guild.id,
        discordId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.avatar,
        roles: member.roles.cache.map((role) => role.id),
        joinedAt: member.joinedAt,
        isBot: member.user.bot,
      },
      update: {
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.avatar,
        roles: member.roles.cache.map((role) => role.id),
        joinedAt: member.joinedAt,
        isBot: member.user.bot,
      },
    });
  }

  console.log(
    `✅ ${guild.name}: синхронизировано участников: ${members.size}`
  );
}

export async function markGuildBotAbsent(guildId: string) {
  await prisma.guild
    .update({
      where: { id: guildId },
      data: { botPresent: false },
    })
    .catch(() => {});
}