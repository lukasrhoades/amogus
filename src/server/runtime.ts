import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { PrismaGameSessionRepo } from "../adapters/prisma/prisma-game-session-repo";
import { GameSessionService } from "../application/game-session-service";
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
  const driver = process.env.GAME_SESSION_REPO ?? "memory";
  if (driver === "prisma") {
    return new PrismaGameSessionRepo(getPrismaClient());
  }
  return new InMemoryGameSessionRepo();
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
