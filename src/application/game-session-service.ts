import {
  Result,
  TransitionErrorCode,
  GameState,
  LobbyId,
  PlayerId,
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
  setPlayerConnection,
  revealQuestion,
  startDiscussion,
  startRound,
  submitAnswer,
} from "../domain/game/state-machine";
import { GameSessionRepo } from "../ports/game-session-repo";

export type ServiceErrorCode = "game_not_found" | TransitionErrorCode;

export type ServiceError = {
  code: ServiceErrorCode;
  message: string;
};

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

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
  constructor(private readonly repo: GameSessionRepo) {}

  async create(state: GameState): Promise<void> {
    await this.repo.save(state);
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

    await this.repo.save(next.value);
    return ok(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
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

    await this.repo.save(next.value);
    return ok(next.value);
  }
}
