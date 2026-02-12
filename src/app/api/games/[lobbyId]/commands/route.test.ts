import { beforeEach, describe, expect, it } from "vitest";

import { POST as runCommand } from "./route";
import { GET as getLobby } from "../route";
import { POST as createLobby } from "../../../lobbies/route";
import { POST as joinLobby } from "../../../lobbies/[lobbyId]/join/route";
import { resetRuntimeForTests } from "../../../../../server/runtime";
import { encodeSessionCookieValue } from "../../../../../server/session/session";

function context(lobbyId: string) {
  return { params: Promise.resolve({ lobbyId }) };
}

const hostSession = { playerId: "p1", displayName: "Host" };
const p2Session = { playerId: "p2", displayName: "Avery" };
const p3Session = { playerId: "p3", displayName: "Riley" };
const p4Session = { playerId: "p4", displayName: "Jordan" };
const p5Session = { playerId: "p5", displayName: "Casey" };

function cookieHeader(session?: { playerId: string; displayName: string }): Record<string, string> {
  if (session === undefined) {
    return { "Content-Type": "application/json" };
  }

  return {
    "Content-Type": "application/json",
    Cookie: `sdg_session=${encodeSessionCookieValue(session)}`,
  };
}

async function postCommand(
  lobbyId: string,
  body: unknown,
  session?: { playerId: string; displayName: string },
) {
  const request = new Request(`http://localhost/api/games/${lobbyId}/commands`, {
    method: "POST",
    headers: cookieHeader(session),
    body: JSON.stringify(body),
  });
  return runCommand(request, context(lobbyId));
}

async function setupLobby(lobbyId: string): Promise<void> {
  const createRequest = new Request("http://localhost/api/lobbies", {
    method: "POST",
    headers: cookieHeader(hostSession),
    body: JSON.stringify({ lobbyId }),
  });
  const created = await createLobby(createRequest);
  expect(created.status).toBe(201);

  for (const session of [p2Session, p3Session, p4Session, p5Session]) {
    const joinRequest = new Request(`http://localhost/api/lobbies/${lobbyId}/join`, {
      method: "POST",
      headers: cookieHeader(session),
      body: JSON.stringify({}),
    });
    const joined = await joinLobby(joinRequest, { params: Promise.resolve({ lobbyId }) });
    expect(joined.status).toBe(200);
  }
}

describe("game command route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("rejects commands without session", async () => {
    await setupLobby("demo-lobby");

    const response = await postCommand("demo-lobby", {
      type: "start_round",
      payload: {
        selection: {
          questionPair: {
            id: "q1",
            ownerId: "p1",
            canonicalQuestion: "Q1",
            impostorQuestion: "Q2",
          },
          impostorCount: 1,
        },
        roundPolicy: {
          eligibilityEnabled: true,
          allowVoteChanges: true,
        },
        roleAssignment: { p2: "impostor", p3: "crew", p4: "crew", p5: "crew" },
      },
    });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(json.error).toBe("no_session");
  });

  it("requires host privileges for host-only commands", async () => {
    await setupLobby("demo-lobby");

    const response = await postCommand(
      "demo-lobby",
      {
        type: "start_round",
        payload: {
          selection: {
            questionPair: {
              id: "q2",
              ownerId: "p1",
              canonicalQuestion: "Q1",
              impostorQuestion: "Q2",
            },
            impostorCount: 1,
          },
          roundPolicy: {
            eligibilityEnabled: true,
            allowVoteChanges: true,
          },
          roleAssignment: { p2: "impostor", p3: "crew", p4: "crew", p5: "crew" },
        },
      },
      p2Session,
    );

    expect(response.status).toBe(409);
  });

  it("runs host start_round and player submit/cast commands using session identity", async () => {
    await setupLobby("demo-lobby");

    const start = await postCommand(
      "demo-lobby",
      {
        type: "start_round",
        payload: {
          selection: {
            questionPair: {
              id: "q3",
              ownerId: "p1",
              canonicalQuestion: "Q1",
              impostorQuestion: "Q2",
            },
            impostorCount: 1,
          },
          roundPolicy: {
            eligibilityEnabled: true,
            allowVoteChanges: true,
          },
          roleAssignment: { p2: "impostor", p3: "crew", p4: "crew", p5: "crew" },
        },
      },
      hostSession,
    );
    expect(start.status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a2" } }, p2Session)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a3" } }, p3Session)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a4" } }, p4Session)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a5" } }, p5Session)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "reveal_question", payload: {} }, hostSession)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "start_discussion", payload: {} }, hostSession)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "end_discussion", payload: {} }, hostSession)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p3" } }, p2Session)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p3Session)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p4Session)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p5Session)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "close_voting", payload: { allowMissingVotes: false } }, hostSession)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "finalize_round", payload: {} }, hostSession)).status).toBe(200);

    const lobbyResponse = await getLobby(new Request("http://localhost/api/games/demo-lobby"), context("demo-lobby"));
    const lobbyJson = (await lobbyResponse.json()) as { completedRounds: number };
    expect(lobbyResponse.status).toBe(200);
    expect(lobbyJson.completedRounds).toBe(1);
  });

  it("supports self leave_lobby and host remove_player", async () => {
    await setupLobby("demo-lobby");

    const leaveResponse = await postCommand("demo-lobby", { type: "leave_lobby", payload: {} }, p5Session);
    const leaveJson = (await leaveResponse.json()) as { state: { players: Array<{ id: string }> } };
    expect(leaveResponse.status).toBe(200);
    expect(leaveJson.state.players.some((p) => p.id === "p5")).toBe(false);

    const removeResponse = await postCommand(
      "demo-lobby",
      { type: "remove_player", payload: { playerId: "p4" } },
      hostSession,
    );
    const removeJson = (await removeResponse.json()) as { state: { players: Array<{ id: string }> } };
    expect(removeResponse.status).toBe(200);
    expect(removeJson.state.players.some((p) => p.id === "p4")).toBe(false);
  });

  it("handles host disconnect transfer voting using session-bound voters", async () => {
    await setupLobby("demo-lobby");

    expect(
      (
        await postCommand(
          "demo-lobby",
          { type: "set_player_connection", payload: { connected: false, nowMs: 1000 } },
          hostSession,
        )
      ).status,
    ).toBe(200);

    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } }, p2Session);
    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } }, p3Session);
    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } }, p4Session);
    const transfer = await postCommand(
      "demo-lobby",
      { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } },
      p5Session,
    );
    const transferJson = (await transfer.json()) as {
      state: { players: Array<{ id: string; isHost: boolean }> };
    };

    expect(transfer.status).toBe(200);
    expect(transferJson.state.players.find((p) => p.id === "p3")?.isHost).toBe(true);
  });
});
