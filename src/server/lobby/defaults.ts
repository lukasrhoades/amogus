import { createInitialGameState } from "../../domain/game/state-machine";
import { GameSettings, GameState, Player } from "../../domain/game/types";

export function defaultGameSettings(): GameSettings {
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

export function createLobbyState(input: {
  lobbyId: string;
  hostPlayerId: string;
  hostDisplayName: string;
}): GameState {
  const host: Player = {
    id: input.hostPlayerId,
    displayName: input.hostDisplayName,
    isHost: true,
    connected: true,
  };

  return createInitialGameState({
    lobbyId: input.lobbyId,
    players: [host],
    settings: defaultGameSettings(),
  });
}

export function addPlayerToLobbyState(
  state: GameState,
  input: { playerId: string; displayName: string },
): GameState {
  const existing = state.players[input.playerId];
  if (existing !== undefined) {
    return {
      ...state,
      players: {
        ...state.players,
        [input.playerId]: {
          ...existing,
          displayName: input.displayName,
          connected: true,
        },
      },
    };
  }

  return {
    ...state,
    players: {
      ...state.players,
      [input.playerId]: {
        id: input.playerId,
        displayName: input.displayName,
        isHost: false,
        connected: true,
      },
    },
    scoreboard: {
      ...state.scoreboard,
      [input.playerId]: {
        totalPoints: 0,
        impostorSurvivalWins: 0,
      },
    },
  };
}
