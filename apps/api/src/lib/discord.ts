import axios from "axios";
import { env } from "./env";

const DISCORD_API = "https://discord.com/api/v10";

export const DISCORD_OAUTH_SCOPES = ["identify", "email", "guilds"].join(" ");

export function getDiscordAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: DISCORD_OAUTH_SCOPES,
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Обмен code -> токены. DISCORD_CLIENT_SECRET используется ТОЛЬКО здесь, на бэкенде.
export async function exchangeDiscordCode(code: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });

  const { data } = await axios.post<DiscordTokenResponse>(
    `${DISCORD_API}/oauth2/token`,
    body.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}

export async function refreshDiscordToken(refreshToken: string): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const { data } = await axios.post<DiscordTokenResponse>(
    `${DISCORD_API}/oauth2/token`,
    body.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const { data } = await axios.get<DiscordUser>(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string; // bitfield string
}

export async function getDiscordUserGuilds(accessToken: string): Promise<DiscordUserGuild[]> {
  const { data } = await axios.get<DiscordUserGuild[]>(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

// MANAGE_GUILD = 0x20, ADMINISTRATOR = 0x8
const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

export function canManageGuild(permissions: string): boolean {
  const perms = BigInt(permissions);
  return (perms & BigInt(MANAGE_GUILD)) === BigInt(MANAGE_GUILD) ||
    (perms & BigInt(ADMINISTRATOR)) === BigInt(ADMINISTRATOR) ||
    false;
}

// ---- Bot-token вызовы (модерация, инфо о гильдии) — используют DISCORD_BOT_TOKEN,
// который никогда не покидает сервер API. ----

const botClient = axios.create({
  baseURL: DISCORD_API,
  headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
});

export const discordBot = {
  getGuild: (guildId: string) => botClient.get(`/guilds/${guildId}`),
  getGuildMembers: (guildId: string, limit = 1000) =>
    botClient.get(`/guilds/${guildId}/members`, { params: { limit } }),
  banMember: (guildId: string, userId: string, reason?: string) =>
    botClient.put(
      `/guilds/${guildId}/bans/${userId}`,
      {},
      { headers: reason ? { "X-Audit-Log-Reason": reason } : {} }
    ),
  unbanMember: (guildId: string, userId: string, reason?: string) =>
    botClient.delete(`/guilds/${guildId}/bans/${userId}`, {
      headers: reason ? { "X-Audit-Log-Reason": reason } : {},
    }),
  kickMember: (guildId: string, userId: string, reason?: string) =>
    botClient.delete(`/guilds/${guildId}/members/${userId}`, {
      headers: reason ? { "X-Audit-Log-Reason": reason } : {},
    }),
  timeoutMember: (guildId: string, userId: string, until: Date, reason?: string) =>
    botClient.patch(
      `/guilds/${guildId}/members/${userId}`,
      { communication_disabled_until: until.toISOString() },
      { headers: reason ? { "X-Audit-Log-Reason": reason } : {} }
    ),
  // Отправка сообщений через REST — этому не нужен запущенный Gateway-процесс
  // apps/bot, достаточно Bot Token (тот же, что для kick/ban выше). Используется
  // для анонсов турниров: кнопка со ссылкой (button style LINK) не требует
  // обработки interaction — Discord сам открывает URL, поэтому серверу не нужно
  // слушать взаимодействия для самой регистрации.
  sendChannelMessage: (channelId: string, payload: { embeds?: unknown[]; components?: unknown[]; content?: string }) =>
    botClient.post(`/channels/${channelId}/messages`, payload),
  editChannelMessage: (
    channelId: string,
    messageId: string,
    payload: { embeds?: unknown[]; components?: unknown[]; content?: string }
  ) => botClient.patch(`/channels/${channelId}/messages/${messageId}`, payload),
};
