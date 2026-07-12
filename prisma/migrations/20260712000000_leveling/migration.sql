-- CreateTable
CREATE TABLE "LevelingConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "xpMin" INTEGER NOT NULL DEFAULT 15,
    "xpMax" INTEGER NOT NULL DEFAULT 25,
    "cooldownSec" INTEGER NOT NULL DEFAULT 60,
    "announce" BOOLEAN NOT NULL DEFAULT true,
    "ignoredChannels" JSONB NOT NULL DEFAULT '[]',
    "ignoredRoles" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "LevelingConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "MemberLevel" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MemberLevel_pkey" PRIMARY KEY ("guildId","userId")
);
CREATE INDEX "MemberLevel_guildId_xp_idx" ON "MemberLevel"("guildId", "xp");

-- CreateTable
CREATE TABLE "LevelReward" (
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "LevelReward_pkey" PRIMARY KEY ("guildId","level")
);

-- AddForeignKey
ALTER TABLE "LevelingConfig" ADD CONSTRAINT "LevelingConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
