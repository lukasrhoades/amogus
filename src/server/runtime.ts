import { InMemoryGameSessionRepo } from "../adapters/in-memory/in-memory-game-session-repo";
import { GameSessionService } from "../application/game-session-service";

const runtimeSingleton = Symbol.for("sdg.runtime");

type Runtime = {
  gameService: GameSessionService;
};

type GlobalWithRuntime = typeof globalThis & {
  [runtimeSingleton]?: Runtime;
};

function createRuntime(): Runtime {
  const repo = new InMemoryGameSessionRepo();
  return {
    gameService: new GameSessionService(repo),
  };
}

export function getRuntime(): Runtime {
  const globalRef = globalThis as GlobalWithRuntime;
  if (globalRef[runtimeSingleton] === undefined) {
    globalRef[runtimeSingleton] = createRuntime();
  }
  return globalRef[runtimeSingleton];
}
