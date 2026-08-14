-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('WARN', 'TIMEOUT', 'KICK', 'BAN', 'UNBAN', 'MESSAGE_DELETE', 'SLOWMODE');

-- CreateEnum
CREATE TYPE "AuditLogType" AS ENUM ('MEMBER_JOINED', 'MEMBER_LEFT', 'MESSAGE_DELETED', 'WARNING', 'TIMEOUT', 'KICK', 'BAN', 'ROLE_CHANGED', 'CHANNEL_CREATED', 'CHANNEL_DELETED', 'BOT_ACTION');

-- CreateEnum
CREATE TYPE "SurpriseType" AS ENUM ('RANDOM_REWARD', 'RANDOM_EVENT', 'XP_BOOST', 'ACTIVITY_CHALLENGE');

-- CreateTable
CREATE TABLE "dashboard_users" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "discriminator" TEXT,
    "globalName" TEXT,
    "avatar" TEXT,
    "email" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jwtId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" TEXT NOT NULL,
    "botPresent" BOOLEAN NOT NULL DEFAULT false,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "onlineCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_members" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joinedAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeChannelId" TEXT,
    "welcomeMessage" TEXT,
    "autoRoleId" TEXT,
    "antiSpam" BOOLEAN NOT NULL DEFAULT false,
    "antiLink" BOOLEAN NOT NULL DEFAULT false,
    "antiRaid" BOOLEAN NOT NULL DEFAULT false,
    "toxicityDetection" BOOLEAN NOT NULL DEFAULT false,
    "autoModeration" BOOLEAN NOT NULL DEFAULT false,
    "aiAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiModerationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiRecommendations" BOOLEAN NOT NULL DEFAULT true,
    "voiceTempChannels" BOOLEAN NOT NULL DEFAULT false,
    "voiceAutoCleanup" BOOLEAN NOT NULL DEFAULT true,
    "voiceDefaultLimit" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetMemberId" TEXT,
    "targetDiscordId" TEXT NOT NULL,
    "targetUsername" TEXT NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "reason" TEXT,
    "moderatorUserId" TEXT,
    "moderatorName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warnings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "onlineCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "newMembers" INTEGER NOT NULL DEFAULT 0,
    "leftMembers" INTEGER NOT NULL DEFAULT 0,
    "voiceMinutes" INTEGER NOT NULL DEFAULT 0,
    "moderationActs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_sessions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "durationSec" INTEGER,

    CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "AuditLogType" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "dashboardUserId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "engagementScore" INTEGER NOT NULL,
    "moderationScore" INTEGER NOT NULL,
    "activityScore" INTEGER NOT NULL,
    "growthScore" INTEGER NOT NULL,
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "insights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surprise_configs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" "SurpriseType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "probability" INTEGER NOT NULL DEFAULT 5,
    "channelId" TEXT,
    "reward" TEXT,
    "startHour" INTEGER DEFAULT 0,
    "endHour" INTEGER DEFAULT 23,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surprise_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surprise_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "type" "SurpriseType" NOT NULL,
    "channelId" TEXT,
    "winnerDiscordId" TEXT,
    "details" JSONB,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surprise_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_users_discordId_key" ON "dashboard_users"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_sessions_jwtId_key" ON "dashboard_sessions"("jwtId");

-- CreateIndex
CREATE INDEX "dashboard_sessions_userId_idx" ON "dashboard_sessions"("userId");

-- CreateIndex
CREATE INDEX "guild_members_guildId_idx" ON "guild_members"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_members_guildId_discordId_key" ON "guild_members"("guildId", "discordId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_settings_guildId_key" ON "guild_settings"("guildId");

-- CreateIndex
CREATE INDEX "moderation_logs_guildId_createdAt_idx" ON "moderation_logs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "warnings_guildId_memberId_idx" ON "warnings"("guildId", "memberId");

-- CreateIndex
CREATE INDEX "analytics_guildId_date_idx" ON "analytics"("guildId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_guildId_date_key" ON "analytics"("guildId", "date");

-- CreateIndex
CREATE INDEX "voice_sessions_guildId_channelId_idx" ON "voice_sessions"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_createdAt_idx" ON "audit_logs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_guildId_type_idx" ON "audit_logs"("guildId", "type");

-- CreateIndex
CREATE INDEX "ai_analyses_guildId_createdAt_idx" ON "ai_analyses"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "surprise_configs_guildId_type_key" ON "surprise_configs"("guildId", "type");

-- CreateIndex
CREATE INDEX "surprise_events_guildId_triggeredAt_idx" ON "surprise_events"("guildId", "triggeredAt");

-- AddForeignKey
ALTER TABLE "dashboard_sessions" ADD CONSTRAINT "dashboard_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "dashboard_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "guild_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_logs" ADD CONSTRAINT "moderation_logs_moderatorUserId_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "guild_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_dashboardUserId_fkey" FOREIGN KEY ("dashboardUserId") REFERENCES "dashboard_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surprise_configs" ADD CONSTRAINT "surprise_configs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surprise_events" ADD CONSTRAINT "surprise_events_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surprise_events" ADD CONSTRAINT "surprise_events_configId_fkey" FOREIGN KEY ("configId") REFERENCES "surprise_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
