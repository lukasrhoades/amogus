import { NextResponse } from "next/server";

import { createInitialGameState } from "../../../../domain/game/state-machine";
import { GameSettings, Player } from "../../../../domain/game/types";
import { getRuntime } from "../../../../server/runtime";

const DEMO_LOBBY_ID = "demo-lobby";

function demoPlayers(): Player[] {
  return [
    { id: "p1", displayName: "Host", isHost: true, connected: true },
    { id: "p2", displayName: "Avery", isHost: false, connected: true },
    { id: "p3", displayName: "Riley", isHost: false, connected: true },
    { id: "p4", displayName: "Jordan", isHost: false, connected: true },
    { id: "p5", displayName: "Casey", isHost: false, connected: true },
  ];
}

function defaultSettings(): GameSettings {
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

export async function POST() {
  const runtime = getRuntime();
  const state = createInitialGameState({
    lobbyId: DEMO_LOBBY_ID,
    players: demoPlayers(),
    settings: defaultSettings(),
  });

  await runtime.gameService.create(state);

  return NextResponse.json({
    lobbyId: DEMO_LOBBY_ID,
    playerCount: Object.keys(state.players).length,
    phase: state.phase,
  });
}
