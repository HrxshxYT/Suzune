-- CreateTable
CREATE TABLE "AutomodRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'any',
    "weight" INTEGER NOT NULL DEFAULT 20,
    "deleteOnHit" BOOLEAN NOT NULL DEFAULT true,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomodRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomodPackState" (
    "guildId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "installedVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AutomodPackState_pkey" PRIMARY KEY ("guildId","packId")
);

-- CreateTable
CREATE TABLE "AutomodLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "heatAfter" INTEGER NOT NULL DEFAULT 0,
    "sample" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomodLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomodRule_guildId_idx" ON "AutomodRule"("guildId");

-- CreateIndex
CREATE INDEX "AutomodLog_guildId_createdAt_idx" ON "AutomodLog"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "AutomodRule" ADD CONSTRAINT "AutomodRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "AutomodConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomodPackState" ADD CONSTRAINT "AutomodPackState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "AutomodConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add the new heat-based scoring columns first. Legacy filter
-- columns are dropped further below, AFTER their intent has been backfilled
-- into AutomodPackState / thresholdAction (this is the destructive part of
-- the automod v2 rewrite: legacy per-filter config is replaced by a
-- weighted-rule + heat-threshold model).
ALTER TABLE "AutomodConfig" ADD COLUMN     "heatDecaySec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "heatThreshold" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "thresholdAction" TEXT NOT NULL DEFAULT 'timeout';

-- Backfill: enable the built-in Core pack for guilds that had any legacy filter on.
INSERT INTO "AutomodPackState" ("guildId", "packId", "enabled", "installedVersion")
SELECT "guildId", 'core', true, 0 FROM "AutomodConfig"
WHERE "antiSpam" = true OR "antiMentionSpam" = true OR "filterInvites" = true
   OR "filterLinks" = true OR "antiCaps" = true OR "antiEmojiSpam" = true;

-- Carry the old single action forward as the heat threshold action where sensible.
UPDATE "AutomodConfig" SET "thresholdAction" =
  CASE WHEN "action" = 'timeout' THEN 'timeout' WHEN "action" = 'warn' THEN 'warn' ELSE 'timeout' END;

-- AlterTable: drop the legacy fixed-filter columns now that their intent has
-- been backfilled above.
ALTER TABLE "AutomodConfig" DROP COLUMN "action",
DROP COLUMN "antiCaps",
DROP COLUMN "antiEmojiSpam",
DROP COLUMN "antiMentionSpam",
DROP COLUMN "antiSpam",
DROP COLUMN "capsMinLength",
DROP COLUMN "capsPercent",
DROP COLUMN "emojiLimit",
DROP COLUMN "filterInvites",
DROP COLUMN "filterLinks",
DROP COLUMN "mentionLimit",
DROP COLUMN "spamCount",
DROP COLUMN "spamWindowSec",
DROP COLUMN "timeoutSeconds";
