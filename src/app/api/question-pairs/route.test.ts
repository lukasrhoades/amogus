import { beforeEach, describe, expect, it } from "vitest";

import { GET as listPairs, POST as createPair } from "./route";
import { DELETE as deletePair } from "./[pairId]/route";
import { resetRuntimeForTests } from "../../../server/runtime";
import { encodeSessionCookieValue } from "../../../server/session/session";

const session = { playerId: "p1", displayName: "Host" };

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Cookie: `sdg_session=${encodeSessionCookieValue(session)}`,
  };
}

describe("question pair routes", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("creates, lists, and deletes own question pairs", async () => {
    const create = await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          promptA: { text: "Q A", target: "crew" },
          promptB: { text: "Q B", target: "impostor" },
        }),
      }),
    );
    const createJson = (await create.json()) as { pair: { id: string } };
    expect(create.status).toBe(201);

    const list = await listPairs(
      new Request("http://localhost/api/question-pairs", {
        method: "GET",
        headers: authHeaders(),
      }),
    );
    const listJson = (await list.json()) as { pairs: Array<{ id: string }> };
    expect(list.status).toBe(200);
    expect(listJson.pairs.some((pair) => pair.id === createJson.pair.id)).toBe(true);

    const deleted = await deletePair(
      new Request(`http://localhost/api/question-pairs/${createJson.pair.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      }),
      { params: Promise.resolve({ pairId: createJson.pair.id }) },
    );
    expect(deleted.status).toBe(200);
  });

  it("rejects invalid pair that is not permissible for impostor", async () => {
    const create = await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          promptA: { text: "Q A", target: "crew" },
          promptB: { text: "Q B", target: "crew" },
        }),
      }),
    );

    expect(create.status).toBe(400);
  });
});
