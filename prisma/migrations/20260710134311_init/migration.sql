-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modLogEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dmOnAction" BOOLEAN NOT NULL DEFAULT true,
    "muteRoleId" TEXT,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntinukeConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "punishment" TEXT NOT NULL DEFAULT 'ban',
    "autoRevert" BOOLEAN NOT NULL DEFAULT true,
    "alertChannelId" TEXT,
    "quarantineRoleId" TEXT,
    "antiRaidEnabled" BOOLEAN NOT NULL DEFAULT false,
    "raidJoinCount" INTEGER NOT NULL DEFAULT 10,
    "raidWindowSec" INTEGER NOT NULL DEFAULT 10,
    "panicMode" BOOLEAN NOT NULL DEFAULT false,
    "thresholds" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AntinukeConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Whitelist" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoggingConfig" (
    "guildId" TEXT NOT NULL,
    "memberJoinLeave" TEXT,
    "messageEdit" TEXT,
    "messageDelete" TEXT,
    "modActions" TEXT,
    "roleChanges" TEXT,
    "channelChanges" TEXT,
    "voice" TEXT,
    "serverChanges" TEXT,
    "disabled" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "LoggingConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ModRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "ModRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'No reason provided',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberInvite" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "inviterId" TEXT,
    "code" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MemberInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteBonus" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InviteBonus_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "AutomodConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "antiSpam" BOOLEAN NOT NULL DEFAULT true,
    "spamCount" INTEGER NOT NULL DEFAULT 5,
    "spamWindowSec" INTEGER NOT NULL DEFAULT 5,
    "antiMentionSpam" BOOLEAN NOT NULL DEFAULT true,
    "mentionLimit" INTEGER NOT NULL DEFAULT 5,
    "filterInvites" BOOLEAN NOT NULL DEFAULT true,
    "filterLinks" BOOLEAN NOT NULL DEFAULT false,
    "antiCaps" BOOLEAN NOT NULL DEFAULT false,
    "capsPercent" INTEGER NOT NULL DEFAULT 70,
    "capsMinLength" INTEGER NOT NULL DEFAULT 10,
    "antiEmojiSpam" BOOLEAN NOT NULL DEFAULT false,
    "emojiLimit" INTEGER NOT NULL DEFAULT 8,
    "action" TEXT NOT NULL DEFAULT 'delete',
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "exemptRoles" JSONB NOT NULL DEFAULT '[]',
    "exemptChannels" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "AutomodConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "WelcomeConfig" (
    "guildId" TEXT NOT NULL,
    "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "welcomeChannelId" TEXT,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Welcome {mention} to **{server}**! You are member #{memberCount}.',
    "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "goodbyeChannelId" TEXT,
    "goodbyeMessage" TEXT NOT NULL DEFAULT '**{user}** has left the server.',

    CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "AutoRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "AutoRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "ReactionRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Whitelist_guildId_targetId_key" ON "Whitelist"("guildId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ModRole_guildId_roleId_key" ON "ModRole"("guildId", "roleId");

-- CreateIndex
CREATE INDEX "Case_guildId_targetId_idx" ON "Case"("guildId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_guildId_caseNumber_key" ON "Case"("guildId", "caseNumber");

-- CreateIndex
CREATE INDEX "MemberInvite_guildId_inviterId_idx" ON "MemberInvite"("guildId", "inviterId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberInvite_guildId_memberId_key" ON "MemberInvite"("guildId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoRole_guildId_roleId_key" ON "AutoRole"("guildId", "roleId");

-- CreateIndex
CREATE INDEX "ReactionRole_guildId_messageId_idx" ON "ReactionRole"("guildId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRole_guildId_messageId_emoji_key" ON "ReactionRole"("guildId", "messageId", "emoji");

-- AddForeignKey
ALTER TABLE "AntinukeConfig" ADD CONSTRAINT "AntinukeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Whitelist" ADD CONSTRAINT "Whitelist_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggingConfig" ADD CONSTRAINT "LoggingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModRole" ADD CONSTRAINT "ModRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomodConfig" ADD CONSTRAINT "AutomodConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeConfig" ADD CONSTRAINT "WelcomeConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoRole" ADD CONSTRAINT "AutoRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRole" ADD CONSTRAINT "ReactionRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
