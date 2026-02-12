import { beforeEach, describe, expect, it } from "vitest";

import { POST as seedDemoLobby } from "../../../dev/seed/route";
import { POST as runCommand } from "./route";
import { GET as getLobby } from "../route";
import { resetRuntimeForTests } from "../../../../../server/runtime";

function context(lobbyId: string) {
  return { params: Promise.resolve({ lobbyId }) };
}

async function postCommand(lobbyId: string, body: unknown) {
  const request = new Request(`http://localhost/api/games/${lobbyId}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return runCommand(request, context(lobbyId));
}

describe("game command route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("returns invalid_command for malformed payload", async () => {
    await seedDemoLobby();

    const response = await postCommand("demo-lobby", { type: "start_round" });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toBe("invalid_command");
  });

  it("returns game_not_found when lobby does not exist", async () => {
    const response = await postCommand("missing", {
        type: "reveal_question",
        payload: {},
    });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toBe("game_not_found");
  });

  it("runs a start_round command and exposes resulting state", async () => {
    await seedDemoLobby();

    const response = await postCommand("demo-lobby", {
        type: "start_round",
        payload: {
          selection: {
            questionPair: {
              id: "q-route-1",
              ownerId: "p1",
              canonicalQuestion: "Which meal could you eat daily?",
              impostorQuestion: "Which snack could you eat daily?",
            },
            impostorCount: 1,
          },
          roundPolicy: {
            eligibilityEnabled: true,
            allowVoteChanges: true,
          },
          roleAssignment: {
            p2: "impostor",
            p3: "crew",
            p4: "crew",
            p5: "crew",
          },
        },
    });
    const json = (await response.json()) as {
      ok: boolean;
      state: {
        phase: string;
        hasCurrentRound: boolean;
        currentRound: { phase: string; satOutPlayerId: string | null; answersCount: number } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.state.phase).toBe("prompting");
    expect(json.state.hasCurrentRound).toBe(true);
    expect(json.state.currentRound?.phase).toBe("prompting");
    expect(json.state.currentRound?.satOutPlayerId).toBe("p1");
    expect(json.state.currentRound?.answersCount).toBe(0);

    const lobbyResponse = await getLobby(new Request("http://localhost/api/games/demo-lobby"), context("demo-lobby"));
    const lobbyJson = (await lobbyResponse.json()) as { phase: string; hasCurrentRound: boolean };
    expect(lobbyResponse.status).toBe(200);
    expect(lobbyJson.phase).toBe("prompting");
    expect(lobbyJson.hasCurrentRound).toBe(true);
  });

  it("executes a full round lifecycle through command API", async () => {
    await seedDemoLobby();

    await postCommand("demo-lobby", {
      type: "start_round",
      payload: {
        selection: {
          questionPair: {
            id: "q-route-2",
            ownerId: "p1",
            canonicalQuestion: "Which movie genre do you like?",
            impostorQuestion: "Which song genre do you like?",
          },
          impostorCount: 1,
        },
        roundPolicy: {
          eligibilityEnabled: true,
          allowVoteChanges: true,
        },
        roleAssignment: {
          p2: "impostor",
          p3: "crew",
          p4: "crew",
          p5: "crew",
        },
      },
    });

    for (const playerId of ["p2", "p3", "p4", "p5"]) {
      const response = await postCommand("demo-lobby", {
        type: "submit_answer",
        payload: { playerId, answer: `route-answer-${playerId}` },
      });
      expect(response.status).toBe(200);
    }

    expect((await postCommand("demo-lobby", { type: "reveal_question", payload: {} })).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "start_discussion", payload: {} })).status).toBe(200);
    expect((await postCommand("demo-lobby", { type: "end_discussion", payload: {} })).status).toBe(200);

    expect(
      (await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p2", targetId: "p3" } })).status,
    ).toBe(200);
    expect(
      (await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p3", targetId: "p2" } })).status,
    ).toBe(200);
    expect(
      (await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p4", targetId: "p2" } })).status,
    ).toBe(200);
    expect(
      (await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p5", targetId: "p2" } })).status,
    ).toBe(200);

    expect(
      (await postCommand("demo-lobby", { type: "close_voting", payload: { allowMissingVotes: false } })).status,
    ).toBe(200);
    expect((await postCommand("demo-lobby", { type: "finalize_round", payload: {} })).status).toBe(200);

    const lobbyResponse = await getLobby(new Request("http://localhost/api/games/demo-lobby"), context("demo-lobby"));
    const lobbyJson = (await lobbyResponse.json()) as {
      phase: string;
      completedRounds: number;
      scoreboard: Record<string, { totalPoints: number }>;
    };
    expect(lobbyResponse.status).toBe(200);
    expect(lobbyJson.phase).toBe("setup");
    expect(lobbyJson.completedRounds).toBe(1);
    expect(lobbyJson.scoreboard.p2?.totalPoints).toBe(0);
    expect(lobbyJson.scoreboard.p3?.totalPoints).toBe(1);
    expect(lobbyJson.scoreboard.p4?.totalPoints).toBe(1);
    expect(lobbyJson.scoreboard.p5?.totalPoints).toBe(1);
  });

  it("returns missing_tiebreak when close_voting has a tie without loser", async () => {
    await seedDemoLobby();
    await postCommand("demo-lobby", {
      type: "start_round",
      payload: {
        selection: {
          questionPair: {
            id: "q-route-3",
            ownerId: "p1",
            canonicalQuestion: "Which app do you open first?",
            impostorQuestion: "Which app do you close last?",
          },
          impostorCount: 1,
        },
        roundPolicy: {
          eligibilityEnabled: true,
          allowVoteChanges: true,
        },
        roleAssignment: {
          p2: "impostor",
          p3: "crew",
          p4: "crew",
          p5: "crew",
        },
      },
    });

    for (const playerId of ["p2", "p3", "p4", "p5"]) {
      await postCommand("demo-lobby", {
        type: "submit_answer",
        payload: { playerId, answer: `route-answer-${playerId}` },
      });
    }
    await postCommand("demo-lobby", { type: "reveal_question", payload: {} });
    await postCommand("demo-lobby", { type: "start_discussion", payload: {} });
    await postCommand("demo-lobby", { type: "end_discussion", payload: {} });

    await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p2", targetId: "p3" } });
    await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p3", targetId: "p2" } });
    await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p4", targetId: "p3" } });
    await postCommand("demo-lobby", { type: "cast_vote", payload: { voterId: "p5", targetId: "p2" } });

    const closeResponse = await postCommand("demo-lobby", {
      type: "close_voting",
      payload: { allowMissingVotes: false },
    });
    const closeJson = (await closeResponse.json()) as { error: string };

    expect(closeResponse.status).toBe(400);
    expect(closeJson.error).toBe("missing_tiebreak");
  });

  it("cancels a prompting round and returns to setup", async () => {
    await seedDemoLobby();
    await postCommand("demo-lobby", {
      type: "start_round",
      payload: {
        selection: {
          questionPair: {
            id: "q-route-4",
            ownerId: "p1",
            canonicalQuestion: "What is your favorite hobby?",
            impostorQuestion: "What is your favorite sport?",
          },
          impostorCount: 1,
        },
        roundPolicy: {
          eligibilityEnabled: true,
          allowVoteChanges: true,
        },
        roleAssignment: {
          p2: "impostor",
          p3: "crew",
          p4: "crew",
          p5: "crew",
        },
      },
    });

    const response = await postCommand("demo-lobby", {
      type: "cancel_round",
      payload: {
        reason: "admin_skip",
      },
    });
    const json = (await response.json()) as {
      ok: boolean;
      state: { phase: string; hasCurrentRound: boolean };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.state.phase).toBe("setup");
    expect(json.state.hasCurrentRound).toBe(false);
  });

  it("updates player connection via admin command", async () => {
    await seedDemoLobby();

    const response = await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: {
        playerId: "p4",
        connected: false,
      },
    });
    const json = (await response.json()) as {
      ok: boolean;
      state: { players: Array<{ id: string; connected: boolean }> };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);

    const p4 = json.state.players.find((player) => player.id === "p4");
    expect(p4?.connected).toBe(false);
  });

  it("pauses lobby on host disconnect and resumes after unanimous transfer votes", async () => {
    await seedDemoLobby();

    const disconnectResponse = await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: {
        playerId: "p1",
        connected: false,
        nowMs: 1000,
      },
    });
    const disconnectJson = (await disconnectResponse.json()) as {
      state: { status: string; hostDisconnection: unknown };
    };
    expect(disconnectResponse.status).toBe(200);
    expect(disconnectJson.state.status).toBe("paused");

    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { voterId: "p2", newHostId: "p3" } });
    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { voterId: "p3", newHostId: "p3" } });
    await postCommand("demo-lobby", { type: "cast_host_transfer_vote", payload: { voterId: "p4", newHostId: "p3" } });
    const transferResponse = await postCommand("demo-lobby", {
      type: "cast_host_transfer_vote",
      payload: { voterId: "p5", newHostId: "p3" },
    });
    const transferJson = (await transferResponse.json()) as {
      state: { status: string; players: Array<{ id: string; isHost: boolean }> };
    };
    expect(transferResponse.status).toBe(200);
    expect(transferJson.state.status).toBe("waiting");
    expect(transferJson.state.players.find((p) => p.id === "p3")?.isHost).toBe(true);
    expect(transferJson.state.players.find((p) => p.id === "p1")?.isHost).toBe(false);
  });

  it("ends lobby when host timeout elapses with fewer than four connected players", async () => {
    await seedDemoLobby();

    await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: { playerId: "p1", connected: false, nowMs: 1000 },
    });
    await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: { playerId: "p4", connected: false, nowMs: 1200 },
    });
    await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: { playerId: "p5", connected: false, nowMs: 1200 },
    });

    const timeoutResponse = await postCommand("demo-lobby", {
      type: "apply_host_disconnect_timeout",
      payload: { nowMs: 301000 },
    });
    const timeoutJson = (await timeoutResponse.json()) as { state: { status: string; phase: string } };

    expect(timeoutResponse.status).toBe(200);
    expect(timeoutJson.state.status).toBe("ended");
    expect(timeoutJson.state.phase).toBe("game_over");
  });

  it("respects extended host pause window before ending lobby", async () => {
    await seedDemoLobby();

    await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: { playerId: "p1", connected: false, nowMs: 1000 },
    });
    await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: { playerId: "p4", connected: false, nowMs: 1200 },
    });
    await postCommand("demo-lobby", {
      type: "set_player_connection",
      payload: { playerId: "p5", connected: false, nowMs: 1200 },
    });

    const extendResponse = await postCommand("demo-lobby", {
      type: "extend_host_disconnect_pause",
      payload: {},
    });
    expect(extendResponse.status).toBe(200);

    const earlyTimeoutResponse = await postCommand("demo-lobby", {
      type: "apply_host_disconnect_timeout",
      payload: { nowMs: 301000 },
    });
    const earlyTimeoutJson = (await earlyTimeoutResponse.json()) as { state: { status: string; phase: string } };
    expect(earlyTimeoutResponse.status).toBe(200);
    expect(earlyTimeoutJson.state.status).toBe("paused");

    const finalTimeoutResponse = await postCommand("demo-lobby", {
      type: "apply_host_disconnect_timeout",
      payload: { nowMs: 3601000 },
    });
    const finalTimeoutJson = (await finalTimeoutResponse.json()) as { state: { status: string; phase: string } };
    expect(finalTimeoutResponse.status).toBe(200);
    expect(finalTimeoutJson.state.status).toBe("ended");
    expect(finalTimeoutJson.state.phase).toBe("game_over");
  });

  it("removes a player from lobby via admin remove_player command", async () => {
    await seedDemoLobby();

    const response = await postCommand("demo-lobby", {
      type: "remove_player",
      payload: {
        playerId: "p5",
      },
    });
    const json = (await response.json()) as {
      ok: boolean;
      state: { players: Array<{ id: string }> };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.state.players.some((p) => p.id === "p5")).toBe(false);
  });

  it("supports player self-leave via leave_lobby command", async () => {
    await seedDemoLobby();

    const response = await postCommand("demo-lobby", {
      type: "leave_lobby",
      payload: {
        playerId: "p4",
      },
    });
    const json = (await response.json()) as {
      ok: boolean;
      state: { players: Array<{ id: string }> };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.state.players.some((p) => p.id === "p4")).toBe(false);
  });
});
