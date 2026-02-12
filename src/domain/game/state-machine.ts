import {
  GamePhase,
  GameSettings,
  GameState,
  Player,
  PlayerId,
  Result,
  RoundCancellationReason,
  RoundPolicy,
  RoundRoleAssignment,
  RoundSelection,
  RoundState,
  Scoreboard,
  ScoreboardEntry,
  VoteResolution,
  WinnerSummary,
} from "./types";

const MIN_ACTIVE_PLAYERS = 4;
const HOST_RECONNECT_TIMEOUT_MS = 5 * 60 * 1000;

type StartRoundInput = {
  selection: RoundSelection;
  roundPolicy: RoundPolicy;
  roleAssignment: RoundRoleAssignment;
};

type CloseVotingInput = {
  allowMissingVotes: boolean;
  tieBreakLoserId?: PlayerId;
};

type UpdateSettingsInput = {
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

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<T>(code: Parameters<typeof createError>[0], message: string): Result<T> {
  return { ok: false, error: createError(code, message) };
}

function createError(
  code:
    | "invalid_phase"
    | "insufficient_players"
    | "question_reused"
    | "player_not_active"
    | "answer_already_submitted"
    | "missing_answers"
    | "self_vote_forbidden"
    | "vote_locked"
    | "missing_votes"
    | "player_already_voted"
    | "missing_tiebreak"
    | "invalid_role_assignment"
    | "invalid_round"
    | "invalid_settings"
    | "game_over"
    | "host_not_disconnected"
    | "invalid_host_transfer_vote"
    | "pause_extension_unavailable",
  message: string,
) {
  return { code, message };
}

function toPlayerMap(players: Player[]): Record<PlayerId, Player> {
  return players.reduce<Record<PlayerId, Player>>((acc, player) => {
    acc[player.id] = player;
    return acc;
  }, {});
}

function createInitialScoreboard(players: Player[]): Scoreboard {
  return players.reduce<Scoreboard>((acc, player) => {
    acc[player.id] = {
      totalPoints: 0,
      impostorSurvivalWins: 0,
    };
    return acc;
  }, {});
}

export function createInitialGameState(input: {
  lobbyId: string;
  players: Player[];
  settings: GameSettings;
}): GameState {
  return {
    lobbyId: input.lobbyId,
    status: "waiting",
    phase: "setup",
    players: toPlayerMap(input.players),
    settings: input.settings,
    usedQuestionPairIds: new Set<string>(),
    scoreboard: createInitialScoreboard(input.players),
    completedRounds: 0,
    currentRound: null,
    hostDisconnection: null,
  };
}

function getHostId(state: GameState): PlayerId | null {
  const host = Object.values(state.players).find((player) => player.isHost);
  return host?.id ?? null;
}

function ensureNonPausedStatus(status: GameState["status"]): Exclude<GameState["status"], "paused"> {
  return status === "paused" ? "in_progress" : status;
}

function isRoundTerminal(phase: GamePhase): boolean {
  return phase === "round_result" || phase === "setup";
}

function activePlayerIdsForRound(
  state: GameState,
  questionOwnerId: PlayerId,
  roundPolicy: RoundPolicy,
): { activePlayerIds: PlayerId[]; satOutPlayerId: PlayerId | null } {
  const playerIds = Object.keys(state.players);
  const playerCount = playerIds.length;
  const shouldSitOut = roundPolicy.eligibilityEnabled && playerCount >= 5 && state.players[questionOwnerId] !== undefined;

  if (!shouldSitOut) {
    return { activePlayerIds: playerIds, satOutPlayerId: null };
  }

  return {
    activePlayerIds: playerIds.filter((id) => id !== questionOwnerId),
    satOutPlayerId: questionOwnerId,
  };
}

function validateRoleAssignment(
  activePlayerIds: PlayerId[],
  roleAssignment: RoundRoleAssignment,
  impostorCount: number,
): boolean {
  if (Object.keys(roleAssignment).length !== activePlayerIds.length) {
    return false;
  }

  const impostors = activePlayerIds.filter((playerId) => roleAssignment[playerId] === "impostor");
  if (impostors.length !== impostorCount) {
    return false;
  }

  return activePlayerIds.every((playerId) => roleAssignment[playerId] === "impostor" || roleAssignment[playerId] === "crew");
}

export function startRound(state: GameState, input: StartRoundInput): Result<GameState> {
  if (state.phase !== "setup" && state.phase !== "round_result") {
    return err("invalid_phase", `startRound requires setup/round_result, got ${state.phase}`);
  }

  if (state.completedRounds >= state.settings.plannedRounds) {
    return err("game_over", "All planned rounds are already completed");
  }

  if (!state.settings.questionReuseEnabled && state.usedQuestionPairIds.has(input.selection.questionPair.id)) {
    return err("question_reused", "Question pair already used in this game");
  }

  const { activePlayerIds, satOutPlayerId } = activePlayerIdsForRound(
    state,
    input.selection.questionPair.ownerId,
    input.roundPolicy,
  );

  if (activePlayerIds.length < MIN_ACTIVE_PLAYERS) {
    return err("insufficient_players", "Active player count is below minimum required for round");
  }

  if (!validateRoleAssignment(activePlayerIds, input.roleAssignment, input.selection.impostorCount)) {
    return err("invalid_role_assignment", "Role assignment does not match active players or impostor count");
  }

  const nextRound: RoundState = {
    roundNumber: state.completedRounds + 1,
    phase: "prompting",
    roundPolicy: input.roundPolicy,
    selectedQuestionPair: input.selection.questionPair,
    impostorCount: input.selection.impostorCount,
    activePlayerIds,
    satOutPlayerId,
    roles: input.roleAssignment,
    answers: {},
    revealedAnswerCount: 0,
    discussionDeadlineMs: null,
    votes: {},
    eliminatedPlayerId: null,
  };

  const nextUsedQuestionIds = new Set(state.usedQuestionPairIds);
  nextUsedQuestionIds.add(input.selection.questionPair.id);

  return ok({
    ...state,
    status: "in_progress",
    phase: "prompting",
    currentRound: nextRound,
    usedQuestionPairIds: nextUsedQuestionIds,
  });
}

function validProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validScoreValue(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

export function updateSettings(state: GameState, input: UpdateSettingsInput): Result<GameState> {
  if (state.phase !== "setup" && state.phase !== "round_result") {
    return err("invalid_phase", "Settings can only be updated between rounds");
  }
  if (!Number.isInteger(input.plannedRounds) || input.plannedRounds < 5 || input.plannedRounds > 30) {
    return err("invalid_settings", "plannedRounds must be an integer between 5 and 30");
  }
  if (input.plannedRounds < state.completedRounds) {
    return err("invalid_settings", "plannedRounds cannot be less than completed rounds");
  }
  if (
    !validProbability(input.impostorWeights.zero) ||
    !validProbability(input.impostorWeights.one) ||
    !validProbability(input.impostorWeights.two)
  ) {
    return err("invalid_settings", "All impostor weights must be probabilities between 0 and 1");
  }
  const weightSum = input.impostorWeights.zero + input.impostorWeights.one + input.impostorWeights.two;
  if (Math.abs(weightSum - 1) > 0.000001) {
    return err("invalid_settings", "Impostor weights must sum to 1");
  }
  if (
    !validScoreValue(input.scoring.impostorSurvivesPoints) ||
    !validScoreValue(input.scoring.crewVotesOutImpostorPoints) ||
    !validScoreValue(input.scoring.crewVotedOutPenaltyPoints)
  ) {
    return err("invalid_settings", "Scoring values must be integers");
  }
  if (input.scoring.impostorSurvivesPoints < 0 || input.scoring.crewVotesOutImpostorPoints < 0) {
    return err("invalid_settings", "Positive scoring values cannot be negative");
  }
  if (input.scoring.crewVotedOutPenaltyPoints > 0) {
    return err("invalid_settings", "Crew voted-out penalty must be zero or negative");
  }
  if (
    input.discussion.timerSeconds !== null &&
    (!Number.isInteger(input.discussion.timerSeconds) ||
      input.discussion.timerSeconds < 10 ||
      input.discussion.timerSeconds > 600)
  ) {
    return err("invalid_settings", "discussion.timerSeconds must be null or 10-600");
  }

  return ok({
    ...state,
    settings: {
      ...state.settings,
      plannedRounds: input.plannedRounds,
      roundsCappedByQuestions: input.roundsCappedByQuestions,
      questionReuseEnabled: input.questionReuseEnabled,
      impostorWeights: {
        zero: input.impostorWeights.zero,
        one: input.impostorWeights.one,
        two: input.impostorWeights.two,
      },
      scoring: {
        impostorSurvivesPoints: input.scoring.impostorSurvivesPoints,
        crewVotesOutImpostorPoints: input.scoring.crewVotesOutImpostorPoints,
        crewVotedOutPenaltyEnabled: input.scoring.crewVotedOutPenaltyEnabled,
        crewVotedOutPenaltyPoints: input.scoring.crewVotedOutPenaltyPoints,
      },
      discussion: {
        ...state.settings.discussion,
        timerSeconds: input.discussion.timerSeconds,
      },
    },
  });
}

export function submitAnswer(state: GameState, playerId: PlayerId, answer: string): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "prompting") {
    return err("invalid_phase", "submitAnswer requires prompting phase");
  }

  if (!state.currentRound.activePlayerIds.includes(playerId)) {
    return err("player_not_active", "Only active players can submit answers");
  }

  if (state.currentRound.answers[playerId] !== undefined) {
    return err("answer_already_submitted", "Player already submitted an answer");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    answers: {
      ...state.currentRound.answers,
      [playerId]: answer,
    },
  };

  return ok({
    ...state,
    currentRound: nextRound,
  });
}

function allAnswersSubmitted(round: RoundState): boolean {
  return round.activePlayerIds.every((playerId) => round.answers[playerId] !== undefined);
}

export function revealQuestion(state: GameState): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "prompting") {
    return err("invalid_phase", "revealQuestion requires prompting phase");
  }

  if (!allAnswersSubmitted(state.currentRound)) {
    return err("missing_answers", "Cannot reveal question before all active answers are submitted");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    phase: "reveal",
    revealedAnswerCount: 0,
  };

  return ok({
    ...state,
    phase: "reveal",
    currentRound: nextRound,
  });
}

export function revealNextAnswer(state: GameState): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "reveal") {
    return err("invalid_phase", "revealNextAnswer requires reveal phase");
  }

  if (state.currentRound.revealedAnswerCount >= state.currentRound.activePlayerIds.length) {
    return err("invalid_phase", "All answers are already revealed");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    revealedAnswerCount: state.currentRound.revealedAnswerCount + 1,
  };

  return ok({
    ...state,
    currentRound: nextRound,
  });
}

export function startDiscussion(state: GameState, nowMs: number = Date.now()): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "reveal") {
    return err("invalid_phase", "startDiscussion requires reveal phase");
  }
  if (state.currentRound.revealedAnswerCount < state.currentRound.activePlayerIds.length) {
    return err("invalid_phase", "startDiscussion requires all answers to be revealed");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    phase: "discussion",
    discussionDeadlineMs:
      state.settings.discussion.timerSeconds === null
        ? null
        : nowMs + state.settings.discussion.timerSeconds * 1000,
  };

  return ok({
    ...state,
    phase: "discussion",
    currentRound: nextRound,
  });
}

export function endDiscussion(state: GameState): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "discussion") {
    return err("invalid_phase", "endDiscussion requires discussion phase");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    phase: "voting",
    discussionDeadlineMs: null,
  };

  return ok({
    ...state,
    phase: "voting",
    currentRound: nextRound,
  });
}

export function extendDiscussion(state: GameState, input: { addSeconds: number }): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "discussion") {
    return err("invalid_phase", "extendDiscussion requires discussion phase");
  }
  if (state.currentRound.discussionDeadlineMs === null) {
    return err("invalid_phase", "Discussion timer is disabled for this round");
  }
  if (!Number.isInteger(input.addSeconds) || input.addSeconds < 5 || input.addSeconds > 300) {
    return err("invalid_round", "addSeconds must be an integer between 5 and 300");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    discussionDeadlineMs: state.currentRound.discussionDeadlineMs + input.addSeconds * 1000,
  };
  return ok({
    ...state,
    currentRound: nextRound,
  });
}

export function applyDiscussionTimeout(state: GameState, nowMs: number = Date.now()): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "discussion") {
    return ok(state);
  }
  if (state.currentRound.discussionDeadlineMs === null) {
    return ok(state);
  }
  if (nowMs < state.currentRound.discussionDeadlineMs) {
    return ok(state);
  }
  return endDiscussion(state);
}

export function castVote(state: GameState, voterId: PlayerId, targetId: PlayerId): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "voting") {
    return err("invalid_phase", "castVote requires voting phase");
  }

  if (!state.currentRound.activePlayerIds.includes(voterId)) {
    return err("player_not_active", "Only active players can vote");
  }

  if (!state.currentRound.activePlayerIds.includes(targetId)) {
    return err("player_not_active", "Vote target must be an active player");
  }

  if (voterId === targetId) {
    return err("self_vote_forbidden", "Self vote is not allowed");
  }

  if (state.currentRound.votes[voterId] !== undefined && !state.currentRound.roundPolicy.allowVoteChanges) {
    return err("vote_locked", "Vote changes are disabled in this round");
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    votes: {
      ...state.currentRound.votes,
      [voterId]: targetId,
    },
  };

  return ok({
    ...state,
    currentRound: nextRound,
  });
}

function tallyVotes(round: RoundState): Record<PlayerId, number> {
  return round.activePlayerIds.reduce<Record<PlayerId, number>>((acc, playerId) => {
    acc[playerId] = 0;
    return acc;
  }, Object.create(null) as Record<PlayerId, number>);
}

function resolveVotes(round: RoundState, tieBreakLoserId?: PlayerId): Result<VoteResolution> {
  const tally = tallyVotes(round);

  Object.values(round.votes).forEach((targetId) => {
    if (targetId !== undefined && tally[targetId] !== undefined) {
      tally[targetId] += 1;
    }
  });

  const maxVotes = Math.max(...Object.values(tally));
  const topCandidates = Object.keys(tally).filter((playerId) => tally[playerId] === maxVotes);

  if (topCandidates.length === 1) {
    const eliminatedPlayerId = topCandidates[0];
    if (eliminatedPlayerId === undefined) {
      return err("missing_tiebreak", "Unable to resolve elimination candidate");
    }
    return ok({
      eliminatedPlayerId,
      topCandidates,
      requiredTiebreak: false,
    });
  }

  if (tieBreakLoserId === undefined || !topCandidates.includes(tieBreakLoserId)) {
    return err("missing_tiebreak", "Tie detected and tieBreakLoserId is missing or invalid");
  }

  return ok({
    eliminatedPlayerId: tieBreakLoserId,
    topCandidates,
    requiredTiebreak: true,
  });
}

function allVotesSubmitted(round: RoundState): boolean {
  return round.activePlayerIds.every((playerId) => round.votes[playerId] !== undefined);
}

export function closeVotingAndResolve(state: GameState, input: CloseVotingInput): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "voting") {
    return err("invalid_phase", "closeVotingAndResolve requires voting phase");
  }

  if (!allVotesSubmitted(state.currentRound) && !input.allowMissingVotes) {
    return err("missing_votes", "Cannot close voting while votes are missing");
  }

  const resolution = resolveVotes(state.currentRound, input.tieBreakLoserId);
  if (!resolution.ok) {
    return resolution;
  }

  const nextRound: RoundState = {
    ...state.currentRound,
    phase: "round_result",
    eliminatedPlayerId: resolution.value.eliminatedPlayerId,
  };

  return ok({
    ...state,
    phase: "round_result",
    currentRound: nextRound,
  });
}

function applyScore(scoreboard: Scoreboard, playerId: PlayerId, delta: number): Scoreboard {
  const previous: ScoreboardEntry = scoreboard[playerId] ?? {
    totalPoints: 0,
    impostorSurvivalWins: 0,
  };
  return {
    ...scoreboard,
    [playerId]: {
      ...previous,
      totalPoints: previous.totalPoints + delta,
    },
  };
}

function withImpostorSurvivalWin(scoreboard: Scoreboard, playerId: PlayerId): Scoreboard {
  const previous: ScoreboardEntry = scoreboard[playerId] ?? {
    totalPoints: 0,
    impostorSurvivalWins: 0,
  };
  return {
    ...scoreboard,
    [playerId]: {
      ...previous,
      impostorSurvivalWins: previous.impostorSurvivalWins + 1,
    },
  };
}

function finalizeRoundScores(state: GameState, round: RoundState): Scoreboard {
  const crewPenaltyEnabled = state.settings.scoring.crewVotedOutPenaltyEnabled;
  const crewPenalty = crewPenaltyEnabled ? state.settings.scoring.crewVotedOutPenaltyPoints : 0;
  const impostorSurvivePoints = state.settings.scoring.impostorSurvivesPoints;
  const crewImpostorCatchPoints = state.settings.scoring.crewVotesOutImpostorPoints;

  const activePlayerIds = round.activePlayerIds;
  const impostorIds = activePlayerIds.filter((id) => round.roles[id] === "impostor");
  const crewIds = activePlayerIds.filter((id) => round.roles[id] === "crew");
  const eliminated = round.eliminatedPlayerId;

  let nextScoreboard = { ...state.scoreboard };

  if (round.impostorCount === 0) {
    if (eliminated !== null && round.roles[eliminated] === "crew") {
      nextScoreboard = applyScore(nextScoreboard, eliminated, crewPenalty);
    }
    return nextScoreboard;
  }

  if (round.impostorCount === 1) {
    const impostorId = impostorIds[0];
    if (impostorId === undefined) {
      return nextScoreboard;
    }
    if (eliminated === impostorId) {
      crewIds.forEach((crewId) => {
        nextScoreboard = applyScore(nextScoreboard, crewId, crewImpostorCatchPoints);
      });
      return nextScoreboard;
    }

    nextScoreboard = applyScore(nextScoreboard, impostorId, impostorSurvivePoints);
    nextScoreboard = withImpostorSurvivalWin(nextScoreboard, impostorId);
    if (eliminated !== null && round.roles[eliminated] === "crew") {
      nextScoreboard = applyScore(nextScoreboard, eliminated, crewPenalty);
    }
    return nextScoreboard;
  }

  const eliminatedIsImpostor = eliminated !== null && round.roles[eliminated] === "impostor";
  if (eliminatedIsImpostor) {
    const survivingImpostor = impostorIds.find((id) => id !== eliminated);
    if (survivingImpostor !== undefined) {
      nextScoreboard = applyScore(nextScoreboard, survivingImpostor, impostorSurvivePoints);
      nextScoreboard = withImpostorSurvivalWin(nextScoreboard, survivingImpostor);
    }
    crewIds.forEach((crewId) => {
      nextScoreboard = applyScore(nextScoreboard, crewId, crewImpostorCatchPoints);
    });
    return nextScoreboard;
  }

  impostorIds.forEach((impostorId) => {
    nextScoreboard = applyScore(nextScoreboard, impostorId, impostorSurvivePoints);
    nextScoreboard = withImpostorSurvivalWin(nextScoreboard, impostorId);
  });

  if (eliminated !== null && round.roles[eliminated] === "crew") {
    nextScoreboard = applyScore(nextScoreboard, eliminated, crewPenalty);
  }

  return nextScoreboard;
}

export function finalizeRound(state: GameState): Result<GameState> {
  if (state.currentRound === null || state.currentRound.phase !== "round_result") {
    return err("invalid_phase", "finalizeRound requires round_result phase");
  }

  const nextScoreboard = finalizeRoundScores(state, state.currentRound);
  const nextCompletedRounds = state.completedRounds + 1;
  const plannedRounds = state.settings.plannedRounds;
  const isGameOver = nextCompletedRounds >= plannedRounds;

  return ok({
    ...state,
    status: isGameOver ? "ended" : "in_progress",
    phase: isGameOver ? "game_over" : "setup",
    scoreboard: nextScoreboard,
    completedRounds: nextCompletedRounds,
    currentRound: null,
  });
}

export function cancelCurrentRoundBeforeReveal(
  state: GameState,
  _reason: RoundCancellationReason,
): Result<GameState> {
  if (state.currentRound === null) {
    return err("invalid_round", "No round to cancel");
  }

  if (state.currentRound.phase !== "prompting") {
    return err("invalid_phase", "Current round can only be canceled before reveal");
  }

  const shouldReducePlannedRounds =
    state.settings.roundsCappedByQuestions &&
    !state.settings.questionReuseEnabled &&
    state.settings.plannedRounds > state.completedRounds;

  const nextPlannedRounds = shouldReducePlannedRounds
    ? state.settings.plannedRounds - 1
    : state.settings.plannedRounds;

  return ok({
    ...state,
    phase: "setup",
    currentRound: null,
    settings: {
      ...state.settings,
      plannedRounds: nextPlannedRounds,
    },
  });
}

export function computeWinnerSummary(
  state: GameState,
  randomTieWinnerId?: PlayerId,
): Result<WinnerSummary> {
  if (state.phase !== "game_over") {
    return err("invalid_phase", "Winner summary requires game_over phase");
  }

  const playerIds = Object.keys(state.scoreboard);
  const highestScore = Math.max(
    ...playerIds.map((id) => (state.scoreboard[id]?.totalPoints ?? Number.NEGATIVE_INFINITY)),
  );
  const topByScore = playerIds.filter((id) => (state.scoreboard[id]?.totalPoints ?? Number.NEGATIVE_INFINITY) === highestScore);

  if (topByScore.length === 1) {
    return ok({
      winnerPlayerIds: topByScore,
      reason: "highest_score",
    });
  }

  const highestImpostorWins = Math.max(
    ...topByScore.map((id) => (state.scoreboard[id]?.impostorSurvivalWins ?? Number.NEGATIVE_INFINITY)),
  );
  const topByImpostorWins = topByScore.filter(
    (id) => (state.scoreboard[id]?.impostorSurvivalWins ?? Number.NEGATIVE_INFINITY) === highestImpostorWins,
  );

  if (topByImpostorWins.length === 1) {
    return ok({
      winnerPlayerIds: topByImpostorWins,
      reason: "impostor_survival_tiebreak",
    });
  }

  if (randomTieWinnerId === undefined || !topByImpostorWins.includes(randomTieWinnerId)) {
    return err("missing_tiebreak", "Random tiebreak winner must be provided for final tie");
  }

  return ok({
    winnerPlayerIds: [randomTieWinnerId],
    reason: "random_tiebreak",
  });
}

export function canStartAnotherRound(state: GameState): boolean {
  if (state.phase === "game_over") {
    return false;
  }

  const connectedPlayers = Object.values(state.players).filter((player) => player.connected).length;
  return connectedPlayers >= MIN_ACTIVE_PLAYERS && state.completedRounds < state.settings.plannedRounds && isRoundTerminal(state.phase);
}

export function removePlayer(state: GameState, playerId: PlayerId): Result<GameState> {
  const removedPlayer = state.players[playerId];
  if (removedPlayer === undefined) {
    return err("invalid_round", `Player ${playerId} does not exist`);
  }

  const nextPlayers = { ...state.players };
  delete nextPlayers[playerId];

  const nextScoreboard = { ...state.scoreboard };
  delete nextScoreboard[playerId];

  const nextCurrentRound =
    state.currentRound === null
      ? null
      : {
          ...state.currentRound,
          activePlayerIds: state.currentRound.activePlayerIds.filter((id) => id !== playerId),
          satOutPlayerId: state.currentRound.satOutPlayerId === playerId ? null : state.currentRound.satOutPlayerId,
          answers: Object.fromEntries(
            Object.entries(state.currentRound.answers).filter(([id]) => id !== playerId),
          ),
          votes: Object.fromEntries(
            Object.entries(state.currentRound.votes).filter(([id, targetId]) => id !== playerId && targetId !== playerId),
          ),
          roles: Object.fromEntries(
            Object.entries(state.currentRound.roles).filter(([id]) => id !== playerId),
          ),
          eliminatedPlayerId:
            state.currentRound.eliminatedPlayerId === playerId ? null : state.currentRound.eliminatedPlayerId,
        };

  const shouldAssignNewHost = removedPlayer.isHost && Object.keys(nextPlayers).length > 0;
  const promotedHostId = shouldAssignNewHost
    ? (Object.values(nextPlayers).find((player) => player.connected)?.id ??
      Object.values(nextPlayers).find((player) => true)?.id ??
      null)
    : null;

  const playersWithHostReassignment =
    promotedHostId === null
      ? nextPlayers
      : Object.fromEntries(
          Object.entries(nextPlayers).map(([id, player]) => [
            id,
            {
              ...player,
              isHost: id === promotedHostId,
            },
          ]),
        );

  return ok({
    ...state,
    players: playersWithHostReassignment,
    scoreboard: nextScoreboard,
    currentRound: nextCurrentRound,
  });
}

export function setPlayerConnection(
  state: GameState,
  playerId: PlayerId,
  connected: boolean,
  nowMs: number,
): Result<GameState> {
  const player = state.players[playerId];
  if (player === undefined) {
    return err("invalid_round", `Player ${playerId} does not exist`);
  }

  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        connected,
      },
    },
  };

  if (!player.isHost) {
    return ok(nextState);
  }

  if (!connected) {
    return ok({
      ...nextState,
      status: "paused",
      hostDisconnection: {
        disconnectedAtMs: nowMs,
        deadlineMs: nowMs + HOST_RECONNECT_TIMEOUT_MS,
        extendedPauseEnabled: false,
        statusBeforePause: ensureNonPausedStatus(state.status),
        transferVotes: {},
      },
    });
  }

  const restoredStatus =
    state.phase === "game_over"
      ? "ended"
      : state.hostDisconnection?.statusBeforePause ?? ensureNonPausedStatus(state.status);

  return ok({
    ...nextState,
    status: restoredStatus,
    hostDisconnection: null,
  });
}

export function castHostTransferVote(
  state: GameState,
  voterId: PlayerId,
  newHostId: PlayerId,
): Result<GameState> {
  const hostDisconnection = state.hostDisconnection;
  if (hostDisconnection === null) {
    return err("host_not_disconnected", "Host transfer vote requires disconnected host");
  }

  const currentHostId = getHostId(state);
  if (currentHostId === null) {
    return err("invalid_round", "No host is present in lobby state");
  }

  const voter = state.players[voterId];
  const newHost = state.players[newHostId];
  if (voter === undefined || newHost === undefined) {
    return err("invalid_host_transfer_vote", "Voter or proposed host does not exist");
  }

  if (voter.isHost || !voter.connected) {
    return err("invalid_host_transfer_vote", "Only connected non-host players can vote host transfer");
  }

  if (newHost.isHost || !newHost.connected) {
    return err("invalid_host_transfer_vote", "Proposed host must be a connected non-host player");
  }

  const nextVotes = {
    ...hostDisconnection.transferVotes,
    [voterId]: newHostId,
  };

  const requiredVoters = Object.values(state.players)
    .filter((player) => !player.isHost && player.connected)
    .map((player) => player.id);

  const isUnanimous = requiredVoters.length > 0 && requiredVoters.every((id) => nextVotes[id] === newHostId);
  if (!isUnanimous) {
    return ok({
      ...state,
      hostDisconnection: {
        ...hostDisconnection,
        transferVotes: nextVotes,
      },
    });
  }

  return ok({
    ...state,
    status: hostDisconnection.statusBeforePause,
    hostDisconnection: null,
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => {
        if (id === currentHostId) {
          return [id, { ...player, isHost: false }];
        }
        if (id === newHostId) {
          return [id, { ...player, isHost: true }];
        }
        return [id, player];
      }),
    ),
  });
}

export function applyHostDisconnectTimeout(
  state: GameState,
  nowMs: number,
): Result<GameState> {
  const hostDisconnection = state.hostDisconnection;
  if (hostDisconnection === null) {
    return err("host_not_disconnected", "No disconnected host timeout to apply");
  }

  if (nowMs < hostDisconnection.deadlineMs) {
    return ok(state);
  }

  return ok({
    ...state,
    status: "ended",
    phase: "game_over",
    currentRound: null,
    hostDisconnection: null,
  });
}

export function extendHostDisconnectPause(state: GameState): Result<GameState> {
  const hostDisconnection = state.hostDisconnection;
  if (hostDisconnection === null) {
    return err("host_not_disconnected", "No disconnected host pause to extend");
  }

  if (hostDisconnection.extendedPauseEnabled) {
    return err("pause_extension_unavailable", "Host disconnect pause has already been extended");
  }

  const extendedDeadlineMs =
    hostDisconnection.disconnectedAtMs + state.settings.discussion.pausedWatchdogSeconds * 1000;

  return ok({
    ...state,
    hostDisconnection: {
      ...hostDisconnection,
      deadlineMs: extendedDeadlineMs,
      extendedPauseEnabled: true,
    },
  });
}
