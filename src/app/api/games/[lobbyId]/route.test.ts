import { beforeEach, describe, expect, it } from "vitest";

import { GET as getLobby } from "./route";
import { POST as runCommand } from "./commands/route";
import { POST as createLobby } from "../../lobbies/route";
import { POST as joinLobby } from "../../lobbies/[lobbyId]/join/route";
import { POST as createQuestionPair } from "../../question-pairs/route";
import { resetRuntimeForTests } from "../../../../server/runtime";
import { encodeSessionCookieValue } from "../../../../server/session/session";

const hostSession = { playerId: "p1", displayName: "Host" };
const p2Session = { playerId: "p2", displayName: "Avery" };
const p3Session = { playerId: "p3", displayName: "Riley" };
const p4Session = { playerId: "p4", displayName: "Jordan" };

function cookieHeader(session: { playerId: string; displayName: string }): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: `sdg_session=${encodeSessionCookieValue(session)}`,
  };
}

function context(lobbyId: string) {
  return { params: Promise.resolve({ lobbyId }) };
}

async function setupLobby(lobbyId: string) {
  const created = await createLobby(
    new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: cookieHeader(hostSession),
      body: JSON.stringify({ lobbyId }),
    }),
  );
  expect(created.status).toBe(201);

  for (const session of [p2Session, p3Session, p4Session]) {
    const joined = await joinLobby(
      new Request(`http://localhost/api/lobbies/${lobbyId}/join`, {
        method: "POST",
        headers: cookieHeader(session),
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
    await setupLobby("viewer-lobby");

    const createdPair = await createQuestionPair(
      new Request("http://localhost/api/question-pairs", {
        method: "POST",
        headers: cookieHeader(hostSession),
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
        headers: cookieHeader(hostSession),
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
        headers: cookieHeader(p2Session),
      }),
      context("viewer-lobby"),
    );
    const p2Json = (await p2View.json()) as { viewerRound: { role: string | null; prompts: string[] } | null };
    expect(p2View.status).toBe(200);
    expect(p2Json.viewerRound?.role).toBe("impostor");
    expect(p2Json.viewerRound?.prompts).toEqual(["Impostor Prompt"]);

    const p3View = await getLobby(
      new Request("http://localhost/api/games/viewer-lobby", {
        method: "GET",
        headers: cookieHeader(p3Session),
      }),
      context("viewer-lobby"),
    );
    const p3Json = (await p3View.json()) as { viewerRound: { role: string | null; prompts: string[] } | null };
    expect(p3View.status).toBe(200);
    expect(p3Json.viewerRound?.role).toBe("crew");
    expect(p3Json.viewerRound?.prompts).toEqual(["Crew Prompt"]);
  });
});
