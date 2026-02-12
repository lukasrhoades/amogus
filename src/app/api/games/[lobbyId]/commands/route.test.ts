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
});
