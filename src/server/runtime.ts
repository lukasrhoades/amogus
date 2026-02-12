import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { InMemoryQuestionPairRepo } from "../adapters/in-memory/in-memory-question-pair-repo";
import { PrismaGameSessionRepo } from "../adapters/prisma/prisma-game-session-repo";
import { PrismaQuestionPairRepo } from "../adapters/prisma/prisma-question-pair-repo";
import { GameSessionService } from "../application/game-session-service";
import { QuestionPairService } from "../application/question-pair-service";
import { GameState, LobbyId, PlayerId, QuestionPair, QuestionPairId } from "../domain/game/types";
import { GameSessionRepo } from "../ports/game-session-repo";
import { QuestionPairRepo } from "../ports/question-pair-repo";
import { getPrismaClient } from "./prisma-client";
import { LobbyEventBus } from "./realtime/lobby-event-bus";

const runtimeSingleton = Symbol.for("sdg.runtime");

type RepoDriverMode = "memory" | "prisma" | "auto";

type Runtime = {
  gameService: GameSessionService;
  questionPairService: QuestionPairService;
  lobbyEvents: LobbyEventBus;
};

type GlobalWithRuntime = typeof globalThis & {
  [runtimeSingleton]?: Runtime;
};

const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanupMs = 0;
let cleanupInFlight: Promise<void> | null = null;

function maybeRunIdleCleanup(runtime: Runtime): void {
  const now = Date.now();
  if (cleanupInFlight !== null || now - lastCleanupMs < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupMs = now;
  cleanupInFlight = runtime.gameService
    .cleanupIdleLobbies({ nowMs: now })
    .then(() => undefined)
    .catch(() => {
      // Cleanup failures should not take down runtime request handling.
    })
    .finally(() => {
      cleanupInFlight = null;
    });
}

function createRuntime(): Runtime {
  const { gameSessionRepo, questionPairRepo } = createRepos();
  const lobbyEvents = new LobbyEventBus();
  return {
    gameService: new GameSessionService(
      gameSessionRepo,
      {
        onStateSaved: (state) => {
          lobbyEvents.publish(state);
        },
      },
      questionPairRepo,
    ),
    questionPairService: new QuestionPairService(questionPairRepo),
    lobbyEvents,
  };
}

function getRepoDriverMode(): RepoDriverMode {
  const configured = process.env.GAME_SESSION_REPO;
  if (configured === "memory" || configured === "prisma" || configured === "auto") {
    return configured;
  }
  return "auto";
}

function createRepos(): { gameSessionRepo: GameSessionRepo; questionPairRepo: QuestionPairRepo } {
  const driver = getRepoDriverMode();
  if (process.env.NODE_ENV === "production" && driver !== "prisma") {
    throw new Error("Production mode requires GAME_SESSION_REPO=prisma");
  }

  if (driver === "prisma") {
    const prisma = getPrismaClient();
    return {
      gameSessionRepo: new PrismaGameSessionRepo(prisma),
      questionPairRepo: new PrismaQuestionPairRepo(prisma),
    };
  }
  if (driver === "auto") {
    const prisma = getPrismaClient();
    return {
      gameSessionRepo: new AutoFallbackGameSessionRepo(
        new PrismaGameSessionRepo(prisma),
        new InMemoryGameSessionRepo(),
      ),
      questionPairRepo: new AutoFallbackQuestionPairRepo(
        new PrismaQuestionPairRepo(prisma),
        new InMemoryQuestionPairRepo(),
      ),
    };
  }
  return {
    gameSessionRepo: new InMemoryGameSessionRepo(),
    questionPairRepo: new InMemoryQuestionPairRepo(),
  };
}

function isPrismaUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const text = `${error.name} ${error.message}`;
  return (
    text.includes("PrismaClientInitializationError") ||
    text.includes("Can't reach database server") ||
    text.includes("connect ECONNREFUSED")
  );
}

class AutoFallbackGameSessionRepo implements GameSessionRepo {
  private useFallback = false;

  constructor(
    private readonly primary: GameSessionRepo,
    private readonly fallback: GameSessionRepo,
  ) {}

  async getByLobbyId(lobbyId: LobbyId): Promise<GameState | null> {
    if (this.useFallback) {
      return this.fallback.getByLobbyId(lobbyId);
    }

    try {
      return await this.primary.getByLobbyId(lobbyId);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.getByLobbyId(lobbyId);
    }
  }

  async save(state: GameState): Promise<void> {
    if (this.useFallback) {
      await this.fallback.save(state);
      return;
    }

    try {
      await this.primary.save(state);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      await this.fallback.save(state);
    }
  }

  async deleteByLobbyId(lobbyId: LobbyId): Promise<boolean> {
    if (this.useFallback) {
      return this.fallback.deleteByLobbyId(lobbyId);
    }

    try {
      return await this.primary.deleteByLobbyId(lobbyId);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.deleteByLobbyId(lobbyId);
    }
  }

  async listLobbyIds(): Promise<LobbyId[]> {
    if (this.useFallback) {
      return this.fallback.listLobbyIds();
    }

    try {
      return await this.primary.listLobbyIds();
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.listLobbyIds();
    }
  }

  async listLobbyIdsUpdatedBefore(cutoff: Date): Promise<LobbyId[]> {
    if (this.useFallback) {
      return this.fallback.listLobbyIdsUpdatedBefore(cutoff);
    }

    try {
      return await this.primary.listLobbyIdsUpdatedBefore(cutoff);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.listLobbyIdsUpdatedBefore(cutoff);
    }
  }
}

class AutoFallbackQuestionPairRepo implements QuestionPairRepo {
  private useFallback = false;

  constructor(
    private readonly primary: QuestionPairRepo,
    private readonly fallback: QuestionPairRepo,
  ) {}

  async listByOwner(ownerId: PlayerId): Promise<QuestionPair[]> {
    if (this.useFallback) {
      return this.fallback.listByOwner(ownerId);
    }

    try {
      return await this.primary.listByOwner(ownerId);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.listByOwner(ownerId);
    }
  }

  async listByOwnerIds(ownerIds: PlayerId[]): Promise<QuestionPair[]> {
    if (this.useFallback) {
      return this.fallback.listByOwnerIds(ownerIds);
    }

    try {
      return await this.primary.listByOwnerIds(ownerIds);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.listByOwnerIds(ownerIds);
    }
  }

  async create(pair: QuestionPair): Promise<void> {
    if (this.useFallback) {
      await this.fallback.create(pair);
      return;
    }

    try {
      await this.primary.create(pair);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      await this.fallback.create(pair);
    }
  }

  async deleteByOwner(ownerId: PlayerId, pairId: QuestionPairId): Promise<boolean> {
    if (this.useFallback) {
      return this.fallback.deleteByOwner(ownerId, pairId);
    }

    try {
      return await this.primary.deleteByOwner(ownerId, pairId);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.deleteByOwner(ownerId, pairId);
    }
  }
}

export function getRuntime(): Runtime {
  const globalRef = globalThis as GlobalWithRuntime;
  if (globalRef[runtimeSingleton] === undefined) {
    globalRef[runtimeSingleton] = createRuntime();
  }
  maybeRunIdleCleanup(globalRef[runtimeSingleton]);
  return globalRef[runtimeSingleton];
}

export function resetRuntimeForTests(): void {
  const globalRef = globalThis as GlobalWithRuntime;
  delete globalRef[runtimeSingleton];
}

export function getConfiguredRepoDriverMode(): RepoDriverMode {
  return getRepoDriverMode();
}
