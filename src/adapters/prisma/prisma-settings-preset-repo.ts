import { PrismaClient } from "@prisma/client";

import { SettingsPreset, SettingsPresetConfig } from "../../domain/game/settings-preset";
import { SettingsPresetRepo } from "../../ports/settings-preset-repo";

function assertSettingsPresetConfig(value: unknown): SettingsPresetConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid settings preset config in persistence");
  }
  const parsed = value as Partial<SettingsPresetConfig>;
  if (typeof parsed.plannedRounds !== "number") {
    throw new Error("Invalid settings preset config in persistence");
  }
  if (parsed.impostorWeights === undefined || parsed.scoring === undefined) {
    throw new Error("Invalid settings preset config in persistence");
  }
  return parsed as SettingsPresetConfig;
}

export class PrismaSettingsPresetRepo implements SettingsPresetRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async listByOwner(ownerId: string): Promise<SettingsPreset[]> {
    const rows = await this.prisma.settingsPreset.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
      select: {
        ownerId: true,
        name: true,
        config: true,
      },
    });
    return rows.map((row) => ({
      ownerId: row.ownerId,
      name: row.name,
      config: assertSettingsPresetConfig(row.config),
    }));
  }

  async upsert(preset: SettingsPreset): Promise<void> {
    await this.prisma.settingsPreset.upsert({
      where: {
        ownerId_name: {
          ownerId: preset.ownerId,
          name: preset.name,
        },
      },
      update: {
        config: preset.config,
      },
      create: {
        ownerId: preset.ownerId,
        name: preset.name,
        config: preset.config,
      },
    });
  }

  async deleteByOwnerAndName(ownerId: string, name: string): Promise<boolean> {
    const result = await this.prisma.settingsPreset.deleteMany({
      where: {
        ownerId,
        name,
      },
    });
    return result.count > 0;
  }
}
