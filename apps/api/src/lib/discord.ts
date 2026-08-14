import axios, { AxiosError } from "axios";
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

// ============================================================
// OAuth: code -> token
// ============================================================

export async function exchangeDiscordCode(
  code: string
): Promise<DiscordTokenResponse> {
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
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return data;
}

// ============================================================
// OAuth: refresh token
// ============================================================

export async function refreshDiscordToken(
  refreshToken: string
): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const { data } = await axios.post<DiscordTokenResponse>(
    `${DISCORD_API}/oauth2/token`,
    body.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return data;
}

// ============================================================
// Discord user
// ============================================================

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
}

export async function getDiscordUser(
  accessToken: string
): Promise<DiscordUser> {
  const { data } = await axios.get<DiscordUser>(
    `${DISCORD_API}/users/@me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return data;
}

// ============================================================
// Discord guilds
// ============================================================

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

// ============================================================
// Rate-limit helper
// ============================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfter(error: AxiosError): number {
  const retryAfterHeader = error.response?.headers?.["retry-after"];

  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);

    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, 1000), 15000);
    }
  }

  const data = error.response?.data as
    | { retry_after?: number }
    | undefined;

  if (data?.retry_after !== undefined) {
    return Math.min(
      Math.max(Number(data.retry_after) * 1000, 1000),
      15000
    );
  }

  return 3000;
}

// ============================================================
// GET /users/@me/guilds
//
// ВАЖНО:
// Discord может вернуть 429. Не делаем бесконечные запросы.
// Максимум 2 попытки.
// ============================================================

export async function getDiscordUserGuilds(
  accessToken: string
): Promise<DiscordUserGuild[]> {
  const url = `${DISCORD_API}/users/@me/guilds`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await axios.get<DiscordUserGuild[]>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },

        timeout: 10000,
      });

      return data;
    } catch (error) {
      const axiosError = error as AxiosError;

      const status = axiosError.response?.status;

      // 429 = Discord rate limit
      if (status === 429 && attempt === 0) {
        const waitMs = getRetryAfter(axiosError);

        console.warn(
          `[Discord] Rate limit on /users/@me/guilds. Waiting ${waitMs}ms`
        );

        await sleep(waitMs);

        continue;
      }

      throw error;
    }
  }

  throw new Error("DISCORD_GUILDS_REQUEST_FAILED");
}

// ============================================================
// Guild permissions
// ============================================================

// MANAGE_GUILD = 0x20
// ADMINISTRATOR = 0x8

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

export function canManageGuild(permissions: string): boolean {
  try {
    const perms = BigInt(permissions);

    return (
      (perms & MANAGE_GUILD) === MANAGE_GUILD ||
      (perms & ADMINISTRATOR) === ADMINISTRATOR
    );
  } catch {
    return false;
  }
}

// ============================================================
// Bot-token Discord API
// ============================================================

const botClient = axios.create({
  baseURL: DISCORD_API,

  headers: {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
  },

  timeout: 10000,
});

// ============================================================
// Bot API
// ============================================================

export const discordBot = {
  // ----------------------------------------------------------
  // Guild
  // ----------------------------------------------------------

  getGuild: (guildId: string) =>
    botClient.get(`/guilds/${guildId}`),

  // ----------------------------------------------------------
  // Members
  // ----------------------------------------------------------

  getGuildMembers: (
    guildId: string,
    limit = 1000
  ) =>
    botClient.get(`/guilds/${guildId}/members`, {
      params: {
        limit,
      },
    }),

  // ----------------------------------------------------------
  // Ban
  // ----------------------------------------------------------

  banMember: (
    guildId: string,
    userId: string,
    reason?: string
  ) =>
    botClient.put(
      `/guilds/${guildId}/bans/${userId}`,
      {},
      {
        headers: reason
          ? {
              "X-Audit-Log-Reason": reason,
            }
          : {},
      }
    ),

  // ----------------------------------------------------------
  // Unban
  // ----------------------------------------------------------

  unbanMember: (
    guildId: string,
    userId: string,
    reason?: string
  ) =>
    botClient.delete(
      `/guilds/${guildId}/bans/${userId}`,
      {
        headers: reason
          ? {
              "X-Audit-Log-Reason": reason,
            }
          : {},
      }
    ),

  // ----------------------------------------------------------
  // Kick
  // ----------------------------------------------------------

  kickMember: (
    guildId: string,
    userId: string,
    reason?: string
  ) =>
    botClient.delete(
      `/guilds/${guildId}/members/${userId}`,
      {
        headers: reason
          ? {
              "X-Audit-Log-Reason": reason,
            }
          : {},
      }
    ),

  // ----------------------------------------------------------
  // Timeout
  // ----------------------------------------------------------

  timeoutMember: (
    guildId: string,
    userId: string,
    until: Date,
    reason?: string
  ) =>
    botClient.patch(
      `/guilds/${guildId}/members/${userId}`,
      {
        communication_disabled_until:
          until.toISOString(),
      },
      {
        headers: reason
          ? {
              "X-Audit-Log-Reason": reason,
            }
          : {},
      }
    ),

  // ----------------------------------------------------------
  // Send message
  // ----------------------------------------------------------

  sendChannelMessage: (
    channelId: string,
    payload: {
      embeds?: unknown[];
      components?: unknown[];
      content?: string;
    }
  ) =>
    botClient.post(
      `/channels/${channelId}/messages`,
      payload
    ),

  // ----------------------------------------------------------
  // Edit message
  // ----------------------------------------------------------

  editChannelMessage: (
    channelId: string,
    messageId: string,
    payload: {
      embeds?: unknown[];
      components?: unknown[];
      content?: string;
    }
  ) =>
    botClient.patch(
      `/channels/${channelId}/messages/${messageId}`,
      payload
    ),
};