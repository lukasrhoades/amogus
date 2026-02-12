import { GameState, QuestionPair, Role } from "../domain/game/types";

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
  viewerRound: null | {
    viewerPlayerId: string;
    isActive: boolean;
    role: "impostor" | "crew" | null;
    prompts: string[];
  };
};

function promptsForRole(
  pair: QuestionPair,
  role: Role,
): string[] {
  const prompts = [pair.promptA, pair.promptB];
  return prompts
    .filter((prompt) => prompt.target === "both" || prompt.target === role)
    .map((prompt) => prompt.text);
}

export function serializeGameState(state: GameState, viewerPlayerId?: string): SerializedGameState {
  const viewer = viewerPlayerId === undefined ? undefined : state.players[viewerPlayerId];
  const viewerRound =
    viewer === undefined || state.currentRound === null
      ? null
      : (() => {
          const role = state.currentRound.roles[viewer.id] ?? null;
          if (role === null) {
            return {
              viewerPlayerId: viewer.id,
              isActive: false,
              role: null,
              prompts: [] as string[],
            };
          }

          return {
            viewerPlayerId: viewer.id,
            isActive: true,
            role,
            prompts: promptsForRole(state.currentRound.selectedQuestionPair, role),
          };
        })();

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
    viewerRound,
  };
}
