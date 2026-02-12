import { GameState, QuestionPair, Role } from "../domain/game/types";

export type SerializedGameState = {
  lobbyId: string;
  status: string;
  phase: string;
  completedRounds: number;
  plannedRounds: number;
  settings: {
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
    discussion: {
      timerSeconds: number | null;
    };
  };
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
    answersSubmittedBy: string[];
    revealedAnswerCount: number;
    discussionDeadlineMs: number | null;
    votesCount: number;
    votesSubmittedBy: string[];
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
    settings: {
      plannedRounds: state.settings.plannedRounds,
      roundsCappedByQuestions: state.settings.roundsCappedByQuestions,
      questionReuseEnabled: state.settings.questionReuseEnabled,
      impostorWeights: {
        zero: state.settings.impostorWeights.zero,
        one: state.settings.impostorWeights.one,
        two: state.settings.impostorWeights.two,
      },
      scoring: {
        impostorSurvivesPoints: state.settings.scoring.impostorSurvivesPoints,
        crewVotesOutImpostorPoints: state.settings.scoring.crewVotesOutImpostorPoints,
        crewVotedOutPenaltyEnabled: state.settings.scoring.crewVotedOutPenaltyEnabled,
        crewVotedOutPenaltyPoints: state.settings.scoring.crewVotedOutPenaltyPoints,
      },
      discussion: {
        timerSeconds: state.settings.discussion.timerSeconds,
      },
    },
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
            answersSubmittedBy: state.currentRound.activePlayerIds.filter(
              (playerId) => state.currentRound?.answers[playerId] !== undefined,
            ),
            revealedAnswerCount: state.currentRound.revealedAnswerCount,
            discussionDeadlineMs: state.currentRound.discussionDeadlineMs,
            votesCount: Object.keys(state.currentRound.votes).length,
            votesSubmittedBy: state.currentRound.activePlayerIds.filter(
              (playerId) => state.currentRound?.votes[playerId] !== undefined,
            ),
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
                : state.currentRound.activePlayerIds
                    .slice(
                      0,
                      state.currentRound.phase === "reveal"
                        ? state.currentRound.revealedAnswerCount
                        : state.currentRound.activePlayerIds.length,
                    )
                    .map((playerId) => ({
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
