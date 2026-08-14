import { GuildMember } from "discord.js";
import { prisma } from "@horizon/database";
import { bumpAnalytics, snapshotGuildCounts } from "../lib/analytics";

export async function onGuildMemberAdd(member: GuildMember) {
  await prisma.guildMember.upsert({
    where: { guildId_discordId: { guildId: member.guild.id, discordId: member.id } },
    create: {
      guildId: member.guild.id,
      discordId: member.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.avatar,
      roles: member.roles.cache.map((r) => r.id),
      joinedAt: member.joinedAt,
      isBot: member.user.bot,
    },
    update: {
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.avatar,
      joinedAt: member.joinedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      guildId: member.guild.id,
      type: "MEMBER_JOINED",
      actorId: member.id,
      actorName: member.user.username,
      description: `${member.user.username} присоединился к серверу`,
    },
  });

  await bumpAnalytics(member.guild.id, "newMembers");
  await prisma.guild
    .update({ where: { id: member.guild.id }, data: { memberCount: member.guild.memberCount } })
    .catch(() => {});
  await snapshotGuildCounts(member.guild.id, member.guild.memberCount, member.guild.approximatePresenceCount ?? 0);
}
