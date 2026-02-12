export type PlayerId = string;
export type LobbyId = string;
export type RoundNumber = number;
export type QuestionPairId = string;

export type Role = "impostor" | "crew";

export type GamePhase =
  | "setup"
  | "prompting"
  | "reveal"
  | "discussion"
  | "voting"
  | "round_result"
  | "game_over";

export type ImpostorCount = 0 | 1 | 2;

export type ImpostorWeights = {
  zero: number;
  one: number;
  two: number;
};

export type DiscussionConfig = {
  timerSeconds: number | null;
  watchdogSeconds: number;
  pausedWatchdogSeconds: number;
};

export type RoundPolicy = {
  eligibilityEnabled: boolean;
  allowVoteChanges: boolean;
};

export type ScoringConfig = {
  impostorSurvivesPoints: number;
  crewVotesOutImpostorPoints: number;
  crewVotedOutPenaltyEnabled: boolean;
  crewVotedOutPenaltyPoints: number;
};

export type GameSettings = {
  plannedRounds: number;
  roundsCappedByQuestions: boolean;
  questionReuseEnabled: boolean;
  impostorWeights: ImpostorWeights;
  discussion: DiscussionConfig;
  scoring: ScoringConfig;
};

export type Player = {
  id: PlayerId;
  displayName: string;
  isHost: boolean;
  connected: boolean;
};

export type QuestionPair = {
  id: QuestionPairId;
  ownerId: PlayerId;
  canonicalQuestion: string;
  impostorQuestion: string;
};

export type ScoreboardEntry = {
  totalPoints: number;
  impostorSurvivalWins: number;
};

export type Scoreboard = Record<PlayerId, ScoreboardEntry>;

export type RoundSelection = {
  questionPair: QuestionPair;
  impostorCount: ImpostorCount;
};

export type RoundRoleAssignment = Record<PlayerId, Role>;

export type RoundState = {
  roundNumber: RoundNumber;
  phase: Exclude<GamePhase, "setup" | "game_over">;
  roundPolicy: RoundPolicy;
  selectedQuestionPair: QuestionPair;
  impostorCount: ImpostorCount;
  activePlayerIds: PlayerId[];
  satOutPlayerId: PlayerId | null;
  roles: RoundRoleAssignment;
  answers: Partial<Record<PlayerId, string>>;
  votes: Partial<Record<PlayerId, PlayerId>>;
  eliminatedPlayerId: PlayerId | null;
};

export type GameStatus = "waiting" | "in_progress" | "paused" | "ended";

export type HostDisconnectionState = {
  disconnectedAtMs: number;
  deadlineMs: number;
  extendedPauseEnabled: boolean;
  statusBeforePause: Exclude<GameStatus, "paused">;
  transferVotes: Partial<Record<PlayerId, PlayerId>>;
};

export type GameState = {
  lobbyId: LobbyId;
  status: GameStatus;
  phase: GamePhase;
  players: Record<PlayerId, Player>;
  settings: GameSettings;
  usedQuestionPairIds: Set<QuestionPairId>;
  scoreboard: Scoreboard;
  completedRounds: number;
  currentRound: RoundState | null;
  hostDisconnection: HostDisconnectionState | null;
};

export type TransitionErrorCode =
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
  | "game_over"
  | "host_not_disconnected"
  | "invalid_host_transfer_vote"
  | "pause_extension_unavailable";

export type TransitionError = {
  code: TransitionErrorCode;
  message: string;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: TransitionError };

export type VoteResolution = {
  eliminatedPlayerId: PlayerId;
  topCandidates: PlayerId[];
  requiredTiebreak: boolean;
};

export type WinnerSummary = {
  winnerPlayerIds: PlayerId[];
  reason: "highest_score" | "impostor_survival_tiebreak" | "random_tiebreak";
};

export type RoundCancellationReason =
  | "player_removed_before_reveal"
  | "host_removed_disconnected_player"
  | "admin_skip";
