import { SettingsPreset } from "../domain/game/settings-preset";

export interface SettingsPresetRepo {
  listByOwner(ownerId: string): Promise<SettingsPreset[]>;
  upsert(preset: SettingsPreset): Promise<void>;
  deleteByOwnerAndName(ownerId: string, name: string): Promise<boolean>;
}
