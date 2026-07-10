-- CreateTable
CREATE TABLE "AuditConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "events" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditConfig_pkey" PRIMARY KEY ("guildId")
);

-- AddForeignKey
ALTER TABLE "AuditConfig" ADD CONSTRAINT "AuditConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
