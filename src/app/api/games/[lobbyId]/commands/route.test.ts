import { beforeEach, describe, expect, it } from "vitest";

import { POST as runCommand } from "./route";
import { GET as getLobby } from "../route";
import { POST as createLobby } from "../../../lobbies/route";
import { POST as joinLobby } from "../../../lobbies/[lobbyId]/join/route";
import { POST as createQuestionPair } from "../../../question-pairs/route";
import { resetRuntimeForTests } from "../../../../../server/runtime";
import { authCookieFor } from "../../../test-helpers/auth";

function context(lobbyId: string) {
  return { params: Promise.resolve({ lobbyId }) };
}

const hostUser = "p1";
const p2User = "p2";
const p3User = "p3";
const p4User = "p4";
const p5User = "p5";

function cookieHeader(cookie?: string): Record<string, string> {
  if (cookie === undefined) {
    return { "Content-Type": "application/json" };
  }

  return {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
}

async function postCommand(
  lobbyId: string,
  body: unknown,
  cookie?: string,
) {
  const request = new Request(`http://localhost/api/games/${lobbyId}/commands`, {
    method: "POST",
    headers: cookieHeader(cookie),
    body: JSON.stringify(body),
  });
  return runCommand(request, context(lobbyId));
}

async function setupLobby(lobbyId: string): Promise<void> {
  const hostCookie = await authCookieFor(hostUser);
  const p2Cookie = await authCookieFor(p2User);
  const p3Cookie = await authCookieFor(p3User);
  const p4Cookie = await authCookieFor(p4User);
  const p5Cookie = await authCookieFor(p5User);

  const createRequest = new Request("http://localhost/api/lobbies", {
    method: "POST",
    headers: cookieHeader(hostCookie),
    body: JSON.stringify({ lobbyId }),
  });
  const created = await createLobby(createRequest);
  expect(created.status).toBe(201);

  for (const cookie of [p2Cookie, p3Cookie, p4Cookie, p5Cookie]) {
    const joinRequest = new Request(`http://localhost/api/lobbies/${lobbyId}/join`, {
      method: "POST",
      headers: cookieHeader(cookie),
      body: JSON.stringify({}),
    });
    const joined = await joinLobby(joinRequest, { params: Promise.resolve({ lobbyId }) });
    expect(joined.status).toBe(200);
  }
}

async function createPairFor(cookie: string, textSeed: string): Promise<void> {
  const request = new Request("http://localhost/api/question-pairs", {
    method: "POST",
    headers: cookieHeader(cookie),
    body: JSON.stringify({
      promptA: { text: `${textSeed} crew`, target: "crew" },
      promptB: { text: `${textSeed} impostor`, target: "impostor" },
    }),
  });
  const response = await createQuestionPair(request);
  expect(response.status).toBe(201);
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
            promptA: { text: "Q1", target: "crew" },
            promptB: { text: "Q2", target: "impostor" },
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
    const p2Cookie = await authCookieFor(p2User);

    const response = await postCommand(
      "demo-lobby",
      {
        type: "start_round",
        payload: {
          selection: {
            questionPair: {
              id: "q2",
              ownerId: "p1",
              promptA: { text: "Q1", target: "crew" },
              promptB: { text: "Q2", target: "impostor" },
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
      p2Cookie,
    );

    expect(response.status).toBe(403);
  });

  it("runs host start_round and player submit/cast commands using session identity", async () => {
    await setupLobby("demo-lobby");
    const hostCookie = await authCookieFor(hostUser);
    const p2Cookie = await authCookieFor(p2User);
    const p3Cookie = await authCookieFor(p3User);
    const p4Cookie = await authCookieFor(p4User);
    const p5Cookie = await authCookieFor(p5User);

    const start = await postCommand(
      "demo-lobby",
      {
        type: "start_round",
        payload: {
          selection: {
            questionPair: {
              id: "q3",
              ownerId: "p1",
              promptA: { text: "Q1", target: "crew" },
              promptB: { text: "Q2", target: "impostor" },
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
      hostCookie,
    );
    expect(start.status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a2" } }, p2Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a3" } }, p3Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a4" } }, p4Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a5" } }, p5Cookie)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "reveal_question", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "start_discussion", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "end_discussion", payload: {} }, hostCookie)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p3" } }, p2Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p3Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p4Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p5Cookie)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "close_voting", payload: { allowMissingVotes: false } }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "finalize_round", payload: {} }, hostCookie)).status).toBe(200);

    const lobbyResponse = await getLobby(new Request("http://localhost/api/games/demo-lobby", { headers: cookieHeader(hostCookie) }), context("demo-lobby"));
    const lobbyJson = (await lobbyResponse.json()) as { completedRounds: number };
    expect(lobbyResponse.status).toBe(200);
    expect(lobbyJson.completedRounds).toBe(1);
  });

  it("runs start_round_auto using lobby question pool", async () => {
    await setupLobby("demo-lobby");
    const hostCookie = await authCookieFor(hostUser);
    const p2Cookie = await authCookieFor(p2User);
    await createPairFor(hostCookie, "host");
    await createPairFor(p2Cookie, "p2");

    const start = await postCommand(
      "demo-lobby",
      {
        type: "start_round_auto",
        payload: {},
      },
      hostCookie,
    );

    expect(start.status).toBe(200);
    const json = (await start.json()) as {
      state: { phase: string; hasCurrentRound: boolean; currentRound: { impostorCount: number } | null };
    };
    expect(json.state.phase).toBe("prompting");
    expect(json.state.hasCurrentRound).toBe(true);
    expect(json.state.currentRound?.impostorCount).toBeTypeOf("number");
  });

  it("supports self leave_lobby and host remove_player", async () => {
    await setupLobby("demo-lobby");
    const hostCookie = await authCookieFor(hostUser);
    const p5Cookie = await authCookieFor(p5User);

    const leaveResponse = await postCommand("demo-lobby", { type: "leave_lobby", payload: {} }, p5Cookie);
    const leaveJson = (await leaveResponse.json()) as { state: { players: Array<{ id: string }> } };
    expect(leaveResponse.status).toBe(200);
    expect(leaveJson.state.players.some((p) => p.id === "p5")).toBe(false);

    const removeResponse = await postCommand(
      "demo-lobby",
      { type: "remove_player", payload: { playerId: "p4" } },
      hostCookie,
    );
    const removeJson = (await removeResponse.json()) as { state: { players: Array<{ id: string }> } };
    expect(removeResponse.status).toBe(200);
    expect(removeJson.state.players.some((p) => p.id === "p4")).toBe(false);
  });

  it("handles host disconnect transfer voting using session-bound voters", async () => {
    await setupLobby("demo-lobby");
    const hostCookie = await authCookieFor(hostUser);
    const p2Cookie = await authCookieFor(p2User);
    const p3Cookie = await authCookieFor(p3User);
    const p4Cookie = await authCookieFor(p4User);
    const p5Cookie = await authCookieFor(p5User);

    expect(
      (
        await postCommand(
          "demo-lobby",
          { type: "set_player_connection", payload: { connected: false, nowMs: 1000 } },
          hostCookie,
        )
      ).status,
    ).toBe(200);

    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } }, p2Cookie);
    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } }, p3Cookie);
    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } }, p4Cookie);
    const transfer = await postCommand(
      "demo-lobby",
      { type: "cast_host_transfer_vote", payload: { newHostId: "p3" } },
      p5Cookie,
    );
    const transferJson = (await transfer.json()) as {
      state: { players: Array<{ id: string; isHost: boolean }> };
    };

    expect(transfer.status).toBe(200);
    expect(transferJson.state.players.find((p) => p.id === "p3")?.isHost).toBe(true);
  });

  it("returns tieCandidates when close_voting requires tiebreak", async () => {
    await setupLobby("demo-lobby");
    const hostCookie = await authCookieFor(hostUser);
    const p2Cookie = await authCookieFor(p2User);
    const p3Cookie = await authCookieFor(p3User);
    const p4Cookie = await authCookieFor(p4User);
    const p5Cookie = await authCookieFor(p5User);

    expect(
      (
        await postCommand(
          "demo-lobby",
          {
            type: "start_round",
            payload: {
              selection: {
                questionPair: {
                  id: "q4",
                  ownerId: "p1",
                  promptA: { text: "Q1", target: "crew" },
                  promptB: { text: "Q2", target: "impostor" },
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
          hostCookie,
        )
      ).status,
    ).toBe(200);

    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a2" } }, p2Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a3" } }, p3Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a4" } }, p4Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "submit_answer", payload: { answer: "a5" } }, p5Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_question", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "reveal_next_answer", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "start_discussion", payload: {} }, hostCookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "end_discussion", payload: {} }, hostCookie)).status).toBe(200);

    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p3Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p2" } }, p4Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p3" } }, p2Cookie)).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "cast_vote", payload: { targetId: "p3" } }, p5Cookie)).status).toBe(200);

    const closeVoting = await postCommand(
      "demo-lobby",
      { type: "close_voting", payload: { allowMissingVotes: false } },
      hostCookie,
    );
    const closeVotingJson = (await closeVoting.json()) as { error: string; tieCandidates?: string[] };

    expect(closeVoting.status).toBe(400);
    expect(closeVotingJson.error).toBe("missing_tiebreak");
    expect(closeVotingJson.tieCandidates?.slice().sort()).toEqual(["p2", "p3"]);
  });
});
