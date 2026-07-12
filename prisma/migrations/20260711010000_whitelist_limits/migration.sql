-- AlterTable
ALTER TABLE "AntinukeConfig" ADD COLUMN "whitelistLimitEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AntinukeConfig" ADD COLUMN "whitelistLimits" JSONB NOT NULL DEFAULT '{}';
