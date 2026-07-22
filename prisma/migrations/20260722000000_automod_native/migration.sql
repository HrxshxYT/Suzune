-- Native Discord AutoMod configuration on AutomodConfig.
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeInvites" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeMentions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeSpam" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativePresets" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeAlert" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeAlertChannelId" TEXT;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeTimeout" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AutomodConfig" ADD COLUMN "nativeTimeoutSeconds" INTEGER NOT NULL DEFAULT 300;
