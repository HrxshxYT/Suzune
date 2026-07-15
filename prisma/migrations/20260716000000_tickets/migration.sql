-- CreateTable
CREATE TABLE "TicketConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "transcriptChannelId" TEXT,
    "dmTranscript" BOOLEAN NOT NULL DEFAULT false,
    "logChannelId" TEXT,
    "maxOpenPerUser" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "TicketPanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Open a Ticket',
    "description" TEXT NOT NULL DEFAULT 'Select a category below to open a ticket.',
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCategory" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "discordCategoryId" TEXT,
    "staffRoleIds" JSONB NOT NULL DEFAULT '[]',
    "namePrefix" TEXT NOT NULL DEFAULT 'ticket',
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Thanks {mention}, staff will be with you shortly.',
    "reasonPrompt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "panelId" TEXT,
    "categoryId" TEXT,
    "channelId" TEXT NOT NULL,
    "openerId" TEXT NOT NULL,
    "claimedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCounter" (
    "guildId" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TicketCounter_pkey" PRIMARY KEY ("guildId")
);

-- CreateIndex
CREATE INDEX "TicketPanel_guildId_idx" ON "TicketPanel"("guildId");
CREATE INDEX "TicketCategory_panelId_idx" ON "TicketCategory"("panelId");
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");
CREATE UNIQUE INDEX "Ticket_guildId_number_key" ON "Ticket"("guildId", "number");
CREATE INDEX "Ticket_guildId_status_idx" ON "Ticket"("guildId", "status");
CREATE INDEX "Ticket_openerId_status_idx" ON "Ticket"("openerId", "status");

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketPanel" ADD CONSTRAINT "TicketPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "TicketPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketCounter" ADD CONSTRAINT "TicketCounter_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
