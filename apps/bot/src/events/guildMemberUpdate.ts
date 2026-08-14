import { GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "@horizon/database";

export async function onGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
) {
  const oldRoles = new Set(oldMember.roles?.cache.map((r) => r.id) ?? []);
  const newRoles = newMember.roles.cache.map((r) => r.id);
  const rolesChanged =
    oldRoles.size !== newRoles.length || newRoles.some((id) => !oldRoles.has(id));

  await prisma.guildMember.upsert({
    where: { guildId_discordId: { guildId: newMember.guild.id, discordId: newMember.id } },
    create: {
      guildId: newMember.guild.id,
      discordId: newMember.id,
      username: newMember.user.username,
      displayName: newMember.displayName,
      avatar: newMember.user.avatar,
      roles: newRoles,
      joinedAt: newMember.joinedAt,
      isBot: newMember.user.bot,
    },
    update: {
      username: newMember.user.username,
      displayName: newMember.displayName,
      avatar: newMember.user.avatar,
      roles: newRoles,
    },
  });

  if (rolesChanged) {
    await prisma.auditLog.create({
      data: {
        guildId: newMember.guild.id,
        type: "ROLE_CHANGED",
        actorId: newMember.id,
        actorName: newMember.user.username,
        description: `Роли ${newMember.user.username} изменены`,
        metadata: { before: Array.from(oldRoles), after: newRoles },
      },
    });
  }
}
