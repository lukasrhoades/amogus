import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { InMemoryAuthRepo } from "../adapters/in-memory/in-memory-auth-repo";
import { InMemoryQuestionPairRepo } from "../adapters/in-memory/in-memory-question-pair-repo";
import { InMemorySettingsPresetRepo } from "../adapters/in-memory/in-memory-settings-preset-repo";
import { PrismaAuthRepo } from "../adapters/prisma/prisma-auth-repo";
import { PrismaGameSessionRepo } from "../adapters/prisma/prisma-game-session-repo";
import { PrismaQuestionPairRepo } from "../adapters/prisma/prisma-question-pair-repo";
import { PrismaSettingsPresetRepo } from "../adapters/prisma/prisma-settings-preset-repo";
import { AuthService } from "../application/auth-service";
import { GameSessionService } from "../application/game-session-service";
import { QuestionPairService } from "../application/question-pair-service";
import { SettingsPresetService } from "../application/settings-preset-service";
import { SettingsPreset } from "../domain/game/settings-preset";
import { GameState, LobbyId, PlayerId, QuestionPair, QuestionPairId } from "../domain/game/types";
import { AuthRepo } from "../ports/auth-repo";
import { GameSessionRepo } from "../ports/game-session-repo";
import { QuestionPairRepo } from "../ports/question-pair-repo";
import { SettingsPresetRepo } from "../ports/settings-preset-repo";
import { getPrismaClient } from "./prisma-client";
import { LobbyEventBus } from "./realtime/lobby-event-bus";

const runtimeSingleton = Symbol.for("sdg.runtime");

type RepoDriverMode = "memory" | "prisma" | "auto";

type Runtime = {
  authService: AuthService;
  gameService: GameSessionService;
  questionPairService: QuestionPairService;
  settingsPresetService: SettingsPresetService;
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
  const { authRepo, gameSessionRepo, questionPairRepo, settingsPresetRepo } = createRepos();
  const lobbyEvents = new LobbyEventBus();
  return {
    authService: new AuthService(authRepo),
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
    settingsPresetService: new SettingsPresetService(settingsPresetRepo),
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

function createRepos(): {
  authRepo: AuthRepo;
  gameSessionRepo: GameSessionRepo;
  questionPairRepo: QuestionPairRepo;
  settingsPresetRepo: SettingsPresetRepo;
} {
  const driver = getRepoDriverMode();
  if (process.env.NODE_ENV === "production" && driver !== "prisma") {
    throw new Error("Production mode requires GAME_SESSION_REPO=prisma");
  }

  if (driver === "prisma") {
    const prisma = getPrismaClient();
    return {
      authRepo: new PrismaAuthRepo(prisma),
      gameSessionRepo: new PrismaGameSessionRepo(prisma),
      questionPairRepo: new PrismaQuestionPairRepo(prisma),
      settingsPresetRepo: new PrismaSettingsPresetRepo(prisma),
    };
  }
  if (driver === "auto") {
    const prisma = getPrismaClient();
    return {
      authRepo: new AutoFallbackAuthRepo(
        new PrismaAuthRepo(prisma),
        new InMemoryAuthRepo(),
      ),
      gameSessionRepo: new AutoFallbackGameSessionRepo(
        new PrismaGameSessionRepo(prisma),
        new InMemoryGameSessionRepo(),
      ),
      questionPairRepo: new AutoFallbackQuestionPairRepo(
        new PrismaQuestionPairRepo(prisma),
        new InMemoryQuestionPairRepo(),
      ),
      settingsPresetRepo: new AutoFallbackSettingsPresetRepo(
        new PrismaSettingsPresetRepo(prisma),
        new InMemorySettingsPresetRepo(),
      ),
    };
  }
  return {
    authRepo: new InMemoryAuthRepo(),
    gameSessionRepo: new InMemoryGameSessionRepo(),
    questionPairRepo: new InMemoryQuestionPairRepo(),
    settingsPresetRepo: new InMemorySettingsPresetRepo(),
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

class AutoFallbackSettingsPresetRepo implements SettingsPresetRepo {
  private useFallback = false;

  constructor(
    private readonly primary: SettingsPresetRepo,
    private readonly fallback: SettingsPresetRepo,
  ) {}

  async listByOwner(ownerId: string) {
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

  async upsert(preset: SettingsPreset) {
    if (this.useFallback) {
      await this.fallback.upsert(preset);
      return;
    }
    try {
      await this.primary.upsert(preset);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      await this.fallback.upsert(preset);
    }
  }

  async deleteByOwnerAndName(ownerId: string, name: string) {
    if (this.useFallback) {
      return this.fallback.deleteByOwnerAndName(ownerId, name);
    }
    try {
      return await this.primary.deleteByOwnerAndName(ownerId, name);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.deleteByOwnerAndName(ownerId, name);
    }
  }
}

class AutoFallbackAuthRepo implements AuthRepo {
  private useFallback = false;

  constructor(
    private readonly primary: AuthRepo,
    private readonly fallback: AuthRepo,
  ) {}

  async createUser(user: import("../ports/auth-repo").AuthUser): Promise<void> {
    if (this.useFallback) {
      await this.fallback.createUser(user);
      return;
    }
    try {
      await this.primary.createUser(user);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      await this.fallback.createUser(user);
    }
  }

  async getUserByUsername(username: string) {
    if (this.useFallback) {
      return this.fallback.getUserByUsername(username);
    }
    try {
      return await this.primary.getUserByUsername(username);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.getUserByUsername(username);
    }
  }

  async getUserById(userId: string) {
    if (this.useFallback) {
      return this.fallback.getUserById(userId);
    }
    try {
      return await this.primary.getUserById(userId);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.getUserById(userId);
    }
  }

  async createSession(record: import("../ports/auth-repo").AuthSessionRecord): Promise<void> {
    if (this.useFallback) {
      await this.fallback.createSession(record);
      return;
    }
    try {
      await this.primary.createSession(record);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      await this.fallback.createSession(record);
    }
  }

  async getSessionByToken(token: string) {
    if (this.useFallback) {
      return this.fallback.getSessionByToken(token);
    }
    try {
      return await this.primary.getSessionByToken(token);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      return this.fallback.getSessionByToken(token);
    }
  }

  async deleteSession(token: string): Promise<void> {
    if (this.useFallback) {
      await this.fallback.deleteSession(token);
      return;
    }
    try {
      await this.primary.deleteSession(token);
    } catch (error) {
      if (!isPrismaUnavailableError(error)) {
        throw error;
      }
      this.useFallback = true;
      await this.fallback.deleteSession(token);
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
