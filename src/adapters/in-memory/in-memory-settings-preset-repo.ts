import { SettingsPreset } from "../../domain/game/settings-preset";
import { SettingsPresetRepo } from "../../ports/settings-preset-repo";

function presetKey(ownerId: string, name: string): string {
  return `${ownerId}::${name.toLowerCase()}`;
}

export class InMemorySettingsPresetRepo implements SettingsPresetRepo {
  private readonly store = new Map<string, SettingsPreset>();

  async listByOwner(ownerId: string): Promise<SettingsPreset[]> {
    return Array.from(this.store.values())
      .filter((preset) => preset.ownerId === ownerId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsert(preset: SettingsPreset): Promise<void> {
    this.store.set(presetKey(preset.ownerId, preset.name), preset);
  }

  async deleteByOwnerAndName(ownerId: string, name: string): Promise<boolean> {
    return this.store.delete(presetKey(ownerId, name));
  }
}
