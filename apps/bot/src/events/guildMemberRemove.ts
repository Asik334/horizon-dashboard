import { GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "@horizon/database";
import { bumpAnalytics, snapshotGuildCounts } from "../lib/analytics";

export async function onGuildMemberRemove(member: GuildMember | PartialGuildMember) {
  // Саму запись GuildMember НЕ удаляем — на неё могут ссылаться Warning/ModerationLog
  // (история модерации должна остаться доступной, даже если участник вышел).
  await prisma.auditLog.create({
    data: {
      guildId: member.guild.id,
      type: "MEMBER_LEFT",
      actorId: member.id,
      actorName: member.user.username,
      description: `${member.user.username} покинул сервер`,
    },
  });

  await bumpAnalytics(member.guild.id, "leftMembers");
  await prisma.guild
    .update({ where: { id: member.guild.id }, data: { memberCount: member.guild.memberCount } })
    .catch(() => {});
  await snapshotGuildCounts(member.guild.id, member.guild.memberCount, member.guild.approximatePresenceCount ?? 0);
}
