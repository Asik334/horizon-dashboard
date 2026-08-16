export interface DashboardUser {
  id: string;
  discordId: string;
  username: string;
  avatar: string | null;
}

export interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
  memberCount: number;
  onlineCount: number;
}

export interface GuildMember {
  id: string;
  guildId: string;
  discordId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  roles: string[];
  joinedAt: string | null;
  messageCount: number;
  isBot: boolean;
  _count?: { warnings: number };
}

export interface AnalyticsPoint {
  date: string;
  memberCount: number;
  onlineCount: number;
  messageCount: number;
  newMembers: number;
  leftMembers: number;
  voiceMinutes: number;
  moderationActs: number;
}

export interface AIAnalysisResult {
  id: string;
  guildId: string;
  healthScore: number;
  engagementScore: number;
  moderationScore: number;
  activityScore: number;
  growthScore: number;
  recommendations: string[];
  insights: Record<string, unknown> | null;
  createdAt: string;
}

export type ModerationAction = "WARN" | "TIMEOUT" | "KICK" | "BAN" | "UNBAN" | "MESSAGE_DELETE" | "SLOWMODE";

export interface ModerationLogEntry {
  id: string;
  targetUsername: string;
  action: ModerationAction;
  reason: string | null;
  moderatorName: string;
  createdAt: string;
}

export interface VoiceChannelState {
  channelId: string;
  channelName: string;
  users: number;
}

export interface Warning {
  id: string;
  reason: string;
  active: boolean;
  createdAt: string;
}

export interface MemberHistory {
  member: GuildMember;
  warnings: Warning[];
  moderationLogs: ModerationLogEntry[];
}

export interface Paginated<T> {
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  [key: string]: T[] | any;
}

// ---------- TOURNAMENTS ----------

export type TournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ParticipantStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CHECKED_IN" | "DISQUALIFIED" | "REFUNDED";

export type MatchStatus = "PENDING" | "READY" | "COMPLETED" | "BYE";

export interface Tournament {
  id: string;
  guildId: string;
  name: string;
  description: string | null;
  game: string;
  format: "SINGLE_ELIMINATION";
  status: TournamentStatus;
  entryFeeCents: number;
  currency: string;
  maxParticipants: number;
  minParticipants: number;
  prizePool: string | null;
  announceChannelId: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  createdAt: string;
  _count?: { participants: number };
  participants?: TournamentParticipant[];
  matches?: TournamentMatch[];
}

export interface TournamentParticipant {
  id: string;
  tournamentId: string;
  discordId: string;
  username: string;
  avatar: string | null;
  seed: number | null;
  status: ParticipantStatus;
  eliminatedAt: string | null;
  createdAt: string;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  participantAId: string | null;
  participantBId: string | null;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: MatchStatus;
}
