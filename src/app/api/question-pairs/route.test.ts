import { beforeEach, describe, expect, it } from "vitest";

import { GET as listPairs, POST as createPair } from "./route";
import { DELETE as deletePair } from "./[pairId]/route";
import { resetRuntimeForTests } from "../../../server/runtime";
import { encodeSessionCookieValue } from "../../../server/session/session";

const session = { playerId: "p1", displayName: "Host" };
const session2 = { playerId: "p2", displayName: "Avery" };

function authHeaders(s = session) {
  return {
    "Content-Type": "application/json",
    Cookie: `sdg_session=${encodeSessionCookieValue(s)}`,
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

  it("lists only pairs owned by current session", async () => {
    await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify({
          promptA: { text: "A1", target: "crew" },
          promptB: { text: "A2", target: "impostor" },
        }),
      }),
    );
    await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(session2),
        body: JSON.stringify({
          promptA: { text: "B1", target: "both" },
          promptB: { text: "B2", target: "crew" },
        }),
      }),
    );

    const list1 = await listPairs(
      new Request("http://localhost/api/question-pairs", {
        method: "GET",
        headers: authHeaders(session),
      }),
    );
    const list1Json = (await list1.json()) as { pairs: Array<{ promptA: { text: string } }> };
    expect(list1Json.pairs).toHaveLength(1);
    expect(list1Json.pairs[0]?.promptA.text).toBe("A1");

    const list2 = await listPairs(
      new Request("http://localhost/api/question-pairs", {
        method: "GET",
        headers: authHeaders(session2),
      }),
    );
    const list2Json = (await list2.json()) as { pairs: Array<{ promptA: { text: string } }> };
    expect(list2Json.pairs).toHaveLength(1);
    expect(list2Json.pairs[0]?.promptA.text).toBe("B1");
  });
});
