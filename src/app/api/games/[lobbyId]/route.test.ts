import { beforeEach, describe, expect, it } from "vitest";

import { GET as getLobby } from "./route";
import { POST as runCommand } from "./commands/route";
import { POST as createLobby } from "../../lobbies/route";
import { POST as joinLobby } from "../../lobbies/[lobbyId]/join/route";
import { POST as createQuestionPair } from "../../question-pairs/route";
import { resetRuntimeForTests } from "../../../../server/runtime";
import { authCookieFor } from "../../test-helpers/auth";

const hostUsername = "p1";
const p2Username = "p2";
const p3Username = "p3";
const p4Username = "p4";

function cookieHeader(cookie: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
}

function context(lobbyId: string) {
  return { params: Promise.resolve({ lobbyId }) };
}

async function setupLobby(lobbyId: string) {
  const hostCookie = await authCookieFor(hostUsername);
  const p2Cookie = await authCookieFor(p2Username);
  const p3Cookie = await authCookieFor(p3Username);
  const p4Cookie = await authCookieFor(p4Username);

  const created = await createLobby(
    new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: cookieHeader(hostCookie),
      body: JSON.stringify({ lobbyId }),
    }),
  );
  expect(created.status).toBe(201);

  for (const cookie of [p2Cookie, p3Cookie, p4Cookie]) {
    const joined = await joinLobby(
      new Request(`http://localhost/api/lobbies/${lobbyId}/join`, {
        method: "POST",
        headers: cookieHeader(cookie),
        body: JSON.stringify({}),
      }),
      context(lobbyId),
    );
    expect(joined.status).toBe(200);
  }
}

describe("game read route viewer prompts", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("returns role-specific prompt view for each viewer", async () => {
    const hostCookie = await authCookieFor(hostUsername);
    const p2Cookie = await authCookieFor(p2Username);
    const p3Cookie = await authCookieFor(p3Username);

    await setupLobby("viewer-lobby");

    const createdPair = await createQuestionPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: cookieHeader(hostCookie),
        body: JSON.stringify({
          promptA: { text: "Crew Prompt", target: "crew" },
          promptB: { text: "Impostor Prompt", target: "impostor" },
        }),
      }),
    );
    const pairJson = (await createdPair.json()) as {
      pair: {
        id: string;
        ownerId: string;
        promptA: { text: string; target: "crew" | "impostor" | "both" };
        promptB: { text: string; target: "crew" | "impostor" | "both" };
      };
    };
    expect(createdPair.status).toBe(201);

    const started = await runCommand(
      new Request("http://localhost/api/games/viewer-lobby/commands", {
        method: "POST",
        headers: cookieHeader(hostCookie),
        body: JSON.stringify({
          type: "start_round",
          payload: {
            selection: {
              questionPair: pairJson.pair,
              impostorCount: 1,
            },
            roundPolicy: {
              eligibilityEnabled: false,
              allowVoteChanges: true,
            },
            roleAssignment: {
              p1: "crew",
              p2: "impostor",
              p3: "crew",
              p4: "crew",
            },
          },
        }),
      }),
      context("viewer-lobby"),
    );
    expect(started.status).toBe(200);

    const p2View = await getLobby(
      new Request("http://localhost/api/games/viewer-lobby", {
        method: "GET",
        headers: cookieHeader(p2Cookie),
      }),
      context("viewer-lobby"),
    );
    const p2Json = (await p2View.json()) as { viewerRound: { role: string | null; prompt: string | null } | null };
    expect(p2View.status).toBe(200);
    expect(p2Json.viewerRound?.role).toBe("impostor");
    expect(p2Json.viewerRound?.prompt).toBe("Impostor Prompt");

    const p3View = await getLobby(
      new Request("http://localhost/api/games/viewer-lobby", {
        method: "GET",
        headers: cookieHeader(p3Cookie),
      }),
      context("viewer-lobby"),
    );
    const p3Json = (await p3View.json()) as { viewerRound: { role: string | null; prompt: string | null } | null };
    expect(p3View.status).toBe(200);
    expect(p3Json.viewerRound?.role).toBe("crew");
    expect(p3Json.viewerRound?.prompt).toBe("Crew Prompt");
  });

  it("reveals true question and answers after reveal phase starts", async () => {
    const hostCookie = await authCookieFor(hostUsername);
    const p2Cookie = await authCookieFor(p2Username);
    const p3Cookie = await authCookieFor(p3Username);
    const p4Cookie = await authCookieFor(p4Username);

    await setupLobby("reveal-lobby");

    const createdPair = await createQuestionPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: cookieHeader(hostCookie),
        body: JSON.stringify({
          promptA: { text: "True Crew Question", target: "crew" },
          promptB: { text: "Impostor Question", target: "impostor" },
        }),
      }),
    );
    const pairJson = (await createdPair.json()) as {
      pair: {
        id: string;
        ownerId: string;
        promptA: { text: string; target: "crew" | "impostor" | "both" };
        promptB: { text: string; target: "crew" | "impostor" | "both" };
      };
    };

    await runCommand(
      new Request("http://localhost/api/games/reveal-lobby/commands", {
        method: "POST",
        headers: cookieHeader(hostCookie),
        body: JSON.stringify({
          type: "start_round",
          payload: {
            selection: {
              questionPair: pairJson.pair,
              impostorCount: 1,
            },
            roundPolicy: {
              eligibilityEnabled: false,
              allowVoteChanges: true,
            },
            roleAssignment: {
              p1: "crew",
              p2: "impostor",
              p3: "crew",
              p4: "crew",
            },
          },
        }),
      }),
      context("reveal-lobby"),
    );

    for (const [cookie, answer] of [
      [hostCookie, "a1"],
      [p2Cookie, "a2"],
      [p3Cookie, "a3"],
      [p4Cookie, "a4"],
    ] as const) {
      await runCommand(
        new Request("http://localhost/api/games/reveal-lobby/commands", {
          method: "POST",
          headers: cookieHeader(cookie),
          body: JSON.stringify({
            type: "submit_answer",
            payload: { answer },
          }),
        }),
        context("reveal-lobby"),
      );
    }

    await runCommand(
      new Request("http://localhost/api/games/reveal-lobby/commands", {
        method: "POST",
        headers: cookieHeader(hostCookie),
        body: JSON.stringify({
          type: "reveal_question",
          payload: {},
        }),
      }),
      context("reveal-lobby"),
    );

    const p3View = await getLobby(
      new Request("http://localhost/api/games/reveal-lobby", {
        method: "GET",
        headers: cookieHeader(p3Cookie),
      }),
      context("reveal-lobby"),
    );
    const p3Json = (await p3View.json()) as {
      currentRound: {
        trueQuestion: string | null;
        alternativeQuestion: string | null;
        revealedAnswers: Array<{ answer: string }> | null;
      } | null;
    };

    expect(p3View.status).toBe(200);
    expect(p3Json.currentRound?.trueQuestion).toBe("True Crew Question");
    expect(p3Json.currentRound?.alternativeQuestion).toBeNull();
    expect(p3Json.currentRound?.revealedAnswers?.map((a) => a.answer)).toEqual(["a1", "a2", "a3", "a4"]);
  });
});
