import { GameState } from "../../domain/game/types";

type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

export type PersistedGameState = Omit<GameState, "usedQuestionPairIds"> & {
  usedQuestionPairIds: string[];
};

function assertObject(value: unknown, name: string): asserts value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${name} to be a JSON object`);
  }
}

export function toPersistedGameState(state: GameState): PersistedGameState {
  return {
    ...state,
    usedQuestionPairIds: Array.from(state.usedQuestionPairIds),
  };
}

export function fromPersistedGameState(raw: unknown): GameState {
  assertObject(raw, "state");

  const usedQuestionPairIdsRaw = raw.usedQuestionPairIds;
  if (!Array.isArray(usedQuestionPairIdsRaw) || !usedQuestionPairIdsRaw.every((id) => typeof id === "string")) {
    throw new Error("Persisted state has invalid usedQuestionPairIds");
  }

  const next: PersistedGameState = {
    ...(raw as unknown as PersistedGameState),
    usedQuestionPairIds: usedQuestionPairIdsRaw,
  };

  return {
    ...next,
    usedQuestionPairIds: new Set(next.usedQuestionPairIds),
  };
}
