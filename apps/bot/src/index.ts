import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "./lib/env";
import { onReady } from "./events/ready";
import { onGuildCreate } from "./events/guildCreate";
import { onGuildDelete } from "./events/guildDelete";
import { onGuildMemberAdd } from "./events/guildMemberAdd";
import { onGuildMemberRemove } from "./events/guildMemberRemove";
import { onGuildMemberUpdate } from "./events/guildMemberUpdate";
import { onMessageCreate } from "./events/messageCreate";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate";
import { startPeriodicSnapshot } from "./jobs/periodicSnapshot";
import { startSurprisesJob } from "./jobs/surprises";

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers, // privileged — включить в Developer Portal → Bot → Server Members Intent
  GatewayIntentBits.GuildMessages, // НЕ требует MessageContent — мы не читаем текст сообщений
  GatewayIntentBits.GuildVoiceStates,
];

if (env.ENABLE_PRESENCE_INTENT) {
  // privileged — включить в Developer Portal → Bot → Presence Intent
  intents.push(GatewayIntentBits.GuildPresences);
}

const client = new Client({
  intents,
  partials: [Partials.GuildMember, Partials.User],
});

client.once("clientReady", (c) => {
  onReady(c).catch((err) => console.error("Ошибка в onReady:", err));
  startPeriodicSnapshot(c);
  startSurprisesJob(c);
});

client.on("guildCreate", (guild) => onGuildCreate(guild).catch((err) => console.error("guildCreate:", err)));
client.on("guildDelete", (guild) => onGuildDelete(guild).catch((err) => console.error("guildDelete:", err)));
client.on("guildMemberAdd", (member) =>
  onGuildMemberAdd(member).catch((err) => console.error("guildMemberAdd:", err))
);
client.on("guildMemberRemove", (member) =>
  onGuildMemberRemove(member).catch((err) => console.error("guildMemberRemove:", err))
);
client.on("guildMemberUpdate", (oldMember, newMember) =>
  onGuildMemberUpdate(oldMember, newMember).catch((err) => console.error("guildMemberUpdate:", err))
);
client.on("messageCreate", (message) =>
  onMessageCreate(message).catch((err) => console.error("messageCreate:", err))
);
client.on("voiceStateUpdate", (oldState, newState) =>
  onVoiceStateUpdate(oldState, newState).catch((err) => console.error("voiceStateUpdate:", err))
);

client.on("error", (err) => console.error("Discord client error:", err));
client.on("shardError", (err) => console.error("Discord shard error:", err));

process.on("SIGTERM", () => {
  console.log("SIGTERM получен, отключаюсь...");
  client.destroy();
  process.exit(0);
});

client.login(env.DISCORD_BOT_TOKEN).catch((err) => {
  console.error("❌ Не удалось войти в Discord:", err);
  process.exit(1);
});
