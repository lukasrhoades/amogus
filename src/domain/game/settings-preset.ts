export type SettingsPresetConfig = {
  plannedRounds: number;
  roundsCappedByQuestions: boolean;
  questionReuseEnabled: boolean;
  impostorWeights: {
    zero: number;
    one: number;
    two: number;
  };
  scoring: {
    impostorSurvivesPoints: number;
    crewVotesOutImpostorPoints: number;
    crewVotedOutPenaltyEnabled: boolean;
    crewVotedOutPenaltyPoints: number;
  };
};

export type SettingsPreset = {
  ownerId: string;
  name: string;
  config: SettingsPresetConfig;
};
