import { SettingsPreset, SettingsPresetConfig } from "../domain/game/settings-preset";
import { SettingsPresetRepo } from "../ports/settings-preset-repo";

const DEFAULT_PRESET_NAME = "DEFAULT";

function defaultPresetConfig(): SettingsPresetConfig {
  return {
    plannedRounds: 10,
    roundsCappedByQuestions: false,
    questionReuseEnabled: false,
    impostorWeights: { zero: 0.025, one: 0.95, two: 0.025 },
    scoring: {
      impostorSurvivesPoints: 3,
      crewVotesOutImpostorPoints: 1,
      crewVotedOutPenaltyEnabled: true,
      crewVotedOutPenaltyPoints: -1,
    },
  };
}

export type SettingsPresetResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: "invalid_preset_name" | "preset_not_found";
        message: string;
      };
    };

function ok<T>(value: T): SettingsPresetResult<T> {
  return { ok: true, value };
}

function err<T>(code: "invalid_preset_name" | "preset_not_found", message: string): SettingsPresetResult<T> {
  return { ok: false, error: { code, message } };
}

function normalizePresetName(name: string): string {
  return name.trim().toUpperCase();
}

export class SettingsPresetService {
  constructor(private readonly repo: SettingsPresetRepo) {}

  async listOwn(ownerId: string): Promise<SettingsPreset[]> {
    const own = await this.repo.listByOwner(ownerId);
    const hasDefault = own.some((preset) => normalizePresetName(preset.name) === DEFAULT_PRESET_NAME);
    if (hasDefault) {
      return own;
    }
    return [
      {
        ownerId,
        name: DEFAULT_PRESET_NAME,
        config: defaultPresetConfig(),
      },
      ...own,
    ];
  }

  async saveOwn(input: {
    ownerId: string;
    name: string;
    config: SettingsPresetConfig;
  }): Promise<SettingsPresetResult<SettingsPreset>> {
    const normalizedName = normalizePresetName(input.name);
    if (normalizedName.length < 1 || normalizedName.length > 32) {
      return err("invalid_preset_name", "Preset name must be 1-32 chars");
    }

    const preset: SettingsPreset = {
      ownerId: input.ownerId,
      name: normalizedName,
      config: input.config,
    };
    await this.repo.upsert(preset);
    return ok(preset);
  }

  async deleteOwn(ownerId: string, name: string): Promise<SettingsPresetResult<{ deleted: true }>> {
    const normalizedName = normalizePresetName(name);
    if (normalizedName === DEFAULT_PRESET_NAME) {
      return err("invalid_preset_name", "DEFAULT preset cannot be deleted");
    }
    const deleted = await this.repo.deleteByOwnerAndName(ownerId, normalizedName);
    if (!deleted) {
      return err("preset_not_found", "Preset not found");
    }
    return ok({ deleted: true });
  }
}
