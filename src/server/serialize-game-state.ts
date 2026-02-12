import { GameState } from "../domain/game/types";

export type SerializedGameState = {
  lobbyId: string;
  status: string;
  phase: string;
  completedRounds: number;
  plannedRounds: number;
  players: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    isHost: boolean;
  }>;
  scoreboard: GameState["scoreboard"];
  hasCurrentRound: boolean;
  currentRound: null | {
    roundNumber: number;
    phase: string;
    impostorCount: number;
    activePlayerIds: string[];
    satOutPlayerId: string | null;
    answersCount: number;
    votesCount: number;
    eliminatedPlayerId: string | null;
  };
};

export function serializeGameState(state: GameState): SerializedGameState {
  return {
    lobbyId: state.lobbyId,
    status: state.status,
    phase: state.phase,
    completedRounds: state.completedRounds,
    plannedRounds: state.settings.plannedRounds,
    players: Object.values(state.players).map((player) => ({
      id: player.id,
      displayName: player.displayName,
      connected: player.connected,
      isHost: player.isHost,
    })),
    scoreboard: state.scoreboard,
    hasCurrentRound: state.currentRound !== null,
    currentRound:
      state.currentRound === null
        ? null
        : {
            roundNumber: state.currentRound.roundNumber,
            phase: state.currentRound.phase,
            impostorCount: state.currentRound.impostorCount,
            activePlayerIds: state.currentRound.activePlayerIds,
            satOutPlayerId: state.currentRound.satOutPlayerId,
            answersCount: Object.keys(state.currentRound.answers).length,
            votesCount: Object.keys(state.currentRound.votes).length,
            eliminatedPlayerId: state.currentRound.eliminatedPlayerId,
          },
  };
}
