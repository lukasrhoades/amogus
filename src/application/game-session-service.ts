import {
  Result,
  TransitionErrorCode,
  GameState,
  ImpostorCount,
  LobbyId,
  PlayerId,
  QuestionPair,
  RoundCancellationReason,
  RoundRoleAssignment,
  RoundSelection,
  RoundPolicy,
} from "../domain/game/types";
import {
  applyHostDisconnectTimeout,
  castHostTransferVote,
  cancelCurrentRoundBeforeReveal,
  castVote,
  closeVotingAndResolve,
  endDiscussion,
  finalizeRound,
  removePlayer,
  setPlayerConnection,
  revealQuestion,
  extendHostDisconnectPause,
  startDiscussion,
  startRound,
  submitAnswer,
} from "../domain/game/state-machine";
import { GameSessionRepo } from "../ports/game-session-repo";
import { QuestionPairRepo } from "../ports/question-pair-repo";

export type ServiceErrorCode = "game_not_found" | "question_pool_empty" | TransitionErrorCode;

export type ServiceError = {
  code: ServiceErrorCode;
  message: string;
};

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export type GameSessionServiceHooks = {
  onStateSaved?: (state: GameState) => void;
};

export type StartRoundAutoInput = {
  roundPolicy?: RoundPolicyOverride | undefined;
  impostorCountOverride?: ImpostorCount | undefined;
};

type RoundPolicyOverride = {
  eligibilityEnabled?: boolean | undefined;
  allowVoteChanges?: boolean | undefined;
};

function ok<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}

function err<T>(code: ServiceErrorCode, message: string): ServiceResult<T> {
  return { ok: false, error: { code, message } };
}

function fromDomain<T>(result: Result<T>): ServiceResult<T> {
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    };
  }

  return ok(result.value);
}

export class GameSessionService {
  constructor(
    private readonly repo: GameSessionRepo,
    private readonly hooks: GameSessionServiceHooks = {},
    private readonly questionPairs?: QuestionPairRepo,
    private readonly randomFloat: () => number = Math.random,
  ) {}

  private async saveAndNotify(state: GameState): Promise<void> {
    await this.repo.save(state);
    this.hooks.onStateSaved?.(state);
  }

  async create(state: GameState): Promise<void> {
    await this.saveAndNotify(state);
  }

  async deleteLobby(lobbyId: LobbyId): Promise<ServiceResult<{ deleted: true }>> {
    const deleted = await this.repo.deleteByLobbyId(lobbyId);
    if (!deleted) {
      return err("game_not_found", `Lobby ${lobbyId} was not found`);
    }
    return ok({ deleted: true });
  }

  async get(lobbyId: LobbyId): Promise<ServiceResult<GameState>> {
    const state = await this.repo.getByLobbyId(lobbyId);
    if (state === null) {
      return err("game_not_found", `Lobby ${lobbyId} was not found`);
    }

    return ok(state);
  }

  async startRound(
    lobbyId: LobbyId,
    input: {
      selection: RoundSelection;
      roundPolicy: RoundPolicy;
      roleAssignment: RoundRoleAssignment;
    },
  ): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = startRound(stateResult.value, input);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async startRoundAuto(lobbyId: LobbyId, input: StartRoundAutoInput = {}): Promise<ServiceResult<GameState>> {
    if (this.questionPairs === undefined) {
      return err("invalid_round", "Question pair storage is not configured");
    }

    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }
    const state = stateResult.value;

    const ownerIds = Object.keys(state.players);
    const allPairs = await this.questionPairs.listByOwnerIds(ownerIds);
    const availablePairs = state.settings.questionReuseEnabled
      ? allPairs
      : allPairs.filter((pair) => !state.usedQuestionPairIds.has(pair.id));

    if (availablePairs.length === 0) {
      return err("question_pool_empty", "No available question pairs in this lobby pool");
    }

    const selectedQuestion = availablePairs[this.randomIndex(availablePairs.length)];
    if (selectedQuestion === undefined) {
      return err("invalid_round", "Failed to select a question pair");
    }
    const impostorCount = input.impostorCountOverride ?? this.sampleImpostorCount(state);
    const roundPolicy = this.resolveRoundPolicy(state, input.roundPolicy);
    const roleAssignment = this.generateRoleAssignment(state, selectedQuestion, roundPolicy, impostorCount);

    if (!roleAssignment.ok) {
      return roleAssignment;
    }

    const next = startRound(state, {
      selection: {
        questionPair: selectedQuestion,
        impostorCount,
      },
      roundPolicy,
      roleAssignment: roleAssignment.value,
    });
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  private randomIndex(size: number): number {
    return Math.floor(this.randomFloat() * size);
  }

  private sampleImpostorCount(state: GameState): ImpostorCount {
    const roll = this.randomFloat();
    const zeroThreshold = state.settings.impostorWeights.zero;
    const oneThreshold = zeroThreshold + state.settings.impostorWeights.one;

    if (roll < zeroThreshold) {
      return 0;
    }
    if (roll < oneThreshold) {
      return 1;
    }
    return 2;
  }

  private resolveRoundPolicy(state: GameState, override?: RoundPolicyOverride): RoundPolicy {
    const playerCount = Object.keys(state.players).length;
    return {
      eligibilityEnabled: override?.eligibilityEnabled ?? playerCount >= 5,
      allowVoteChanges: override?.allowVoteChanges ?? true,
    };
  }

  private generateRoleAssignment(
    state: GameState,
    questionPair: QuestionPair,
    roundPolicy: RoundPolicy,
    impostorCount: ImpostorCount,
  ): ServiceResult<RoundRoleAssignment> {
    const playerIds = Object.keys(state.players);
    const activePlayerIds =
      roundPolicy.eligibilityEnabled && playerIds.length >= 5 && state.players[questionPair.ownerId] !== undefined
        ? playerIds.filter((id) => id !== questionPair.ownerId)
        : playerIds;

    if (activePlayerIds.length < 4) {
      return err("insufficient_players", "Active player count is below minimum required for round");
    }
    if (impostorCount > activePlayerIds.length) {
      return err("invalid_round", "Impostor count cannot exceed active players");
    }

    const shuffled = [...activePlayerIds];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = this.randomIndex(i + 1);
      const current = shuffled[i];
      const picked = shuffled[j];
      if (current === undefined || picked === undefined) {
        continue;
      }
      shuffled[i] = picked;
      shuffled[j] = current;
    }

    const impostorIds = new Set(shuffled.slice(0, impostorCount));
    const assignment: RoundRoleAssignment = {};
    for (const playerId of activePlayerIds) {
      assignment[playerId] = impostorIds.has(playerId) ? "impostor" : "crew";
    }
    return ok(assignment);
  }

  async submitAnswer(lobbyId: LobbyId, playerId: PlayerId, answer: string): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = submitAnswer(stateResult.value, playerId, answer);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async revealQuestion(lobbyId: LobbyId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = revealQuestion(stateResult.value);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async startDiscussion(lobbyId: LobbyId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = startDiscussion(stateResult.value);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async endDiscussion(lobbyId: LobbyId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = endDiscussion(stateResult.value);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async castVote(lobbyId: LobbyId, voterId: PlayerId, targetId: PlayerId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = castVote(stateResult.value, voterId, targetId);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async closeVotingAndResolve(
    lobbyId: LobbyId,
    input: { allowMissingVotes: boolean; tieBreakLoserId?: PlayerId },
  ): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = closeVotingAndResolve(stateResult.value, input);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async finalizeRound(lobbyId: LobbyId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = finalizeRound(stateResult.value);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async cancelCurrentRoundBeforeReveal(
    lobbyId: LobbyId,
    reason: RoundCancellationReason,
  ): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = cancelCurrentRoundBeforeReveal(stateResult.value, reason);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async setPlayerConnection(
    lobbyId: LobbyId,
    playerId: PlayerId,
    connected: boolean,
    nowMs: number = Date.now(),
  ): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = setPlayerConnection(stateResult.value, playerId, connected, nowMs);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async castHostTransferVote(
    lobbyId: LobbyId,
    voterId: PlayerId,
    newHostId: PlayerId,
  ): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = castHostTransferVote(stateResult.value, voterId, newHostId);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async applyHostDisconnectTimeout(
    lobbyId: LobbyId,
    nowMs: number = Date.now(),
  ): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = applyHostDisconnectTimeout(stateResult.value, nowMs);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async extendHostDisconnectPause(lobbyId: LobbyId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = extendHostDisconnectPause(stateResult.value);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }

  async removePlayer(lobbyId: LobbyId, playerId: PlayerId): Promise<ServiceResult<GameState>> {
    const stateResult = await this.get(lobbyId);
    if (!stateResult.ok) {
      return stateResult;
    }

    const next = removePlayer(stateResult.value, playerId);
    if (!next.ok) {
      return fromDomain(next);
    }

    await this.saveAndNotify(next.value);
    return ok(next.value);
  }
}
