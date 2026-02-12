import { beforeEach, describe, expect, it } from "vitest";

import { GET as listPairs, POST as createPair } from "./route";
import { DELETE as deletePair } from "./[pairId]/route";
import { resetRuntimeForTests } from "../../../server/runtime";
import { authCookieFor } from "../test-helpers/auth";

function authHeaders(cookie: string) {
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
}

describe("question pair routes", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("creates, lists, and deletes own question pairs", async () => {
    const cookie = await authCookieFor("p1");
    const create = await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(cookie),
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
        headers: authHeaders(cookie),
      }),
    );
    const listJson = (await list.json()) as { pairs: Array<{ id: string }> };
    expect(list.status).toBe(200);
    expect(listJson.pairs.some((pair) => pair.id === createJson.pair.id)).toBe(true);

    const deleted = await deletePair(
      new Request(`http://localhost/api/question-pairs/${createJson.pair.id}`, {
        method: "DELETE",
        headers: authHeaders(cookie),
      }),
      { params: Promise.resolve({ pairId: createJson.pair.id }) },
    );
    expect(deleted.status).toBe(200);
  });

  it("rejects invalid pair that is not permissible for impostor", async () => {
    const cookie = await authCookieFor("p1");
    const create = await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(cookie),
        body: JSON.stringify({
          promptA: { text: "Q A", target: "crew" },
          promptB: { text: "Q B", target: "crew" },
        }),
      }),
    );

    expect(create.status).toBe(400);
  });

  it("lists only pairs owned by current session", async () => {
    const cookie1 = await authCookieFor("p1");
    const cookie2 = await authCookieFor("p2");
    await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(cookie1),
        body: JSON.stringify({
          promptA: { text: "A1", target: "crew" },
          promptB: { text: "A2", target: "impostor" },
        }),
      }),
    );
    await createPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: authHeaders(cookie2),
        body: JSON.stringify({
          promptA: { text: "B1", target: "both" },
          promptB: { text: "B2", target: "crew" },
        }),
      }),
    );

    const list1 = await listPairs(
      new Request("http://localhost/api/question-pairs", {
        method: "GET",
        headers: authHeaders(cookie1),
      }),
    );
    const list1Json = (await list1.json()) as { pairs: Array<{ promptA: { text: string } }> };
    expect(list1Json.pairs).toHaveLength(1);
    expect(list1Json.pairs[0]?.promptA.text).toBe("A1");

    const list2 = await listPairs(
      new Request("http://localhost/api/question-pairs", {
        method: "GET",
        headers: authHeaders(cookie2),
      }),
    );
    const list2Json = (await list2.json()) as { pairs: Array<{ promptA: { text: string } }> };
    expect(list2Json.pairs).toHaveLength(1);
    expect(list2Json.pairs[0]?.promptA.text).toBe("B1");
  });
});
