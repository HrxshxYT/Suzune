-- CreateTable
CREATE TABLE "BotStat" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotStat_pkey" PRIMARY KEY ("key")
);
