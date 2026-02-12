import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../../domain/game/state-machine";
import { GameSettings, Player } from "../../domain/game/types";
import { LobbyEventBus } from "./lobby-event-bus";

function settings(): GameSettings {
  return {
    plannedRounds: 10,
    roundsCappedByQuestions: false,
    questionReuseEnabled: false,
    impostorWeights: { zero: 0.025, one: 0.95, two: 0.025 },
    discussion: { timerSeconds: null, watchdogSeconds: 600, pausedWatchdogSeconds: 3600 },
    scoring: {
      impostorSurvivesPoints: 3,
      crewVotesOutImpostorPoints: 1,
      crewVotedOutPenaltyEnabled: true,
      crewVotedOutPenaltyPoints: -1,
    },
  };
}

function players(): Player[] {
  return [
    { id: "p1", displayName: "Host", isHost: true, connected: true },
    { id: "p2", displayName: "A", isHost: false, connected: true },
    { id: "p3", displayName: "B", isHost: false, connected: true },
    { id: "p4", displayName: "C", isHost: false, connected: true },
  ];
}

describe("LobbyEventBus", () => {
  it("notifies subscribers for matching lobby and supports unsubscribe", () => {
    const bus = new LobbyEventBus();
    const state = createInitialGameState({ lobbyId: "l1", players: players(), settings: settings() });

    let count = 0;
    const unsubscribe = bus.subscribe("l1", () => {
      count += 1;
    });

    bus.publish(state);
    expect(count).toBe(1);

    unsubscribe();
    bus.publish(state);
    expect(count).toBe(1);
  });
});
