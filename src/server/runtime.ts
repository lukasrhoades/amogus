import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { PrismaGameSessionRepo } from "../adapters/prisma/prisma-game-session-repo";
import { GameSessionService } from "../application/game-session-service";
import { GameState, LobbyId } from "../domain/game/types";
import { GameSessionRepo } from "../ports/game-session-repo";
import { getPrismaClient } from "./prisma-client";

const runtimeSingleton = Symbol.for("sdg.runtime");

type Runtime = {
  gameService: GameSessionService;
};

type GlobalWithRuntime = typeof globalThis & {
  [runtimeSingleton]?: Runtime;
};

function createRuntime(): Runtime {
  const repo = createGameSessionRepo();
  return {
    gameService: new GameSessionService(repo),
  };
}

function createGameSessionRepo(): GameSessionRepo {
  const driver = process.env.GAME_SESSION_REPO ?? "auto";
  if (driver === "prisma") {
    return new PrismaGameSessionRepo(getPrismaClient());
  }
  if (driver === "auto") {
    return new AutoFallbackGameSessionRepo(
      new PrismaGameSessionRepo(getPrismaClient()),
      new InMemoryGameSessionRepo(),
    );
  }
  return new InMemoryGameSessionRepo();
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
}

export function getRuntime(): Runtime {
  const globalRef = globalThis as GlobalWithRuntime;
  if (globalRef[runtimeSingleton] === undefined) {
    globalRef[runtimeSingleton] = createRuntime();
  }
  return globalRef[runtimeSingleton];
}

export function resetRuntimeForTests(): void {
  const globalRef = globalThis as GlobalWithRuntime;
  delete globalRef[runtimeSingleton];
}
