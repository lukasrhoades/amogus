import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../../domain/game/state-machine";
import { GameSettings, Player } from "../../domain/game/types";
import { fromPersistedGameState, toPersistedGameState } from "./game-state-json";

function players(): Player[] {
  return [
    { id: "p1", displayName: "Host", isHost: true, connected: true },
    { id: "p2", displayName: "A", isHost: false, connected: true },
    { id: "p3", displayName: "B", isHost: false, connected: true },
    { id: "p4", displayName: "C", isHost: false, connected: true },
  ];
}

function settings(): GameSettings {
  return {
    plannedRounds: 10,
    roundsCappedByQuestions: false,
    questionReuseEnabled: false,
    impostorWeights: { zero: 0.025, one: 0.95, two: 0.025 },
    discussion: {
      timerSeconds: null,
      watchdogSeconds: 600,
      pausedWatchdogSeconds: 3600,
    },
    scoring: {
      impostorSurvivesPoints: 3,
      crewVotesOutImpostorPoints: 1,
      crewVotedOutPenaltyEnabled: true,
      crewVotedOutPenaltyPoints: -1,
    },
  };
}

describe("game-state json mapping", () => {
  it("round-trips used question pair set through persisted JSON state", () => {
    const base = createInitialGameState({
      lobbyId: "l1",
      players: players(),
      settings: settings(),
    });

    const state = {
      ...base,
      usedQuestionPairIds: new Set(["q1", "q2"]),
    };

    const persisted = toPersistedGameState(state);
    expect(persisted.usedQuestionPairIds).toEqual(["q1", "q2"]);

    const hydrated = fromPersistedGameState(persisted as unknown as Record<string, unknown>);
    expect(Array.from(hydrated.usedQuestionPairIds)).toEqual(["q1", "q2"]);
  });
});
