-- Create settings presets for host-configured game settings templates.
CREATE TABLE "SettingsPreset" (
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingsPreset_pkey" PRIMARY KEY ("ownerId","name")
);

CREATE INDEX "SettingsPreset_ownerId_idx" ON "SettingsPreset"("ownerId");
