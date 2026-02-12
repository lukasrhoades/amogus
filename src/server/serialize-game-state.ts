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
    trueQuestion: string | null;
    alternativeQuestion: string | null;
    revealedAnswers: Array<{
      playerId: string;
      displayName: string;
      answer: string;
    }> | null;
    revealedRoles: Record<string, "impostor" | "crew"> | null;
  };
  viewerRound: null | {
    viewerPlayerId: string;
    isActive: boolean;
    role: "impostor" | "crew" | null;
    prompt: string | null;
  };
};

function isPromptAllowedForRole(
  prompt: QuestionPair["promptA"],
  role: Role,
): boolean {
  return prompt.target === "both" || prompt.target === role;
}

function promptForRole(
  pair: QuestionPair,
  role: Role,
): string | null {
  if (isPromptAllowedForRole(pair.promptA, role)) {
    return pair.promptA.text;
  }
  if (isPromptAllowedForRole(pair.promptB, role)) {
    return pair.promptB.text;
  }
  return null;
}

function isCrewPermissible(prompt: QuestionPair["promptA"]): boolean {
  return prompt.target === "crew" || prompt.target === "both";
}

function isImpostorPermissible(prompt: QuestionPair["promptA"]): boolean {
  return prompt.target === "impostor" || prompt.target === "both";
}

function revealedQuestions(pair: QuestionPair): { trueQuestion: string; alternativeQuestion: string | null } {
  const prompts = [pair.promptA, pair.promptB];
  const truePrompt = prompts.find(isCrewPermissible) ?? pair.promptA;
  const alternativePrompt = prompts.find((prompt) => isImpostorPermissible(prompt) && prompt.text !== truePrompt.text) ?? null;
  return {
    trueQuestion: truePrompt.text,
    alternativeQuestion: alternativePrompt?.text ?? null,
  };
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
              prompt: null,
            };
          }

          return {
            viewerPlayerId: viewer.id,
            isActive: true,
            role,
            prompt: promptForRole(state.currentRound.selectedQuestionPair, role),
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
            trueQuestion:
              state.currentRound.phase === "prompting"
                ? null
                : revealedQuestions(state.currentRound.selectedQuestionPair).trueQuestion,
            alternativeQuestion:
              null,
            revealedAnswers:
              state.currentRound.phase === "prompting"
                ? null
                : state.currentRound.activePlayerIds.map((playerId) => ({
                    playerId,
                    displayName: state.players[playerId]?.displayName ?? playerId,
                    answer: state.currentRound?.answers[playerId] ?? "",
                  })),
            revealedRoles:
              state.currentRound.phase === "round_result"
                ? state.currentRound.roles
                : null,
          },
    viewerRound,
  };
}
