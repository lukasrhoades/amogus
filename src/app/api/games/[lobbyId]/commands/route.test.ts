import { beforeEach, describe, expect, it } from "vitest";

import { POST as seedDemoLobby } from "../../../dev/seed/route";
import { POST as runCommand } from "./route";
import { GET as getLobby } from "../route";
import { resetRuntimeForTests } from "../../../../../server/runtime";

function context(lobbyId: string) {
  return { params: Promise.resolve({ lobbyId }) };
}

describe("game command route", () => {
  beforeEach(() => {
    resetRuntimeForTests();
  });

  it("returns invalid_command for malformed payload", async () => {
    await seedDemoLobby();

    const request = new Request("http://localhost/api/games/demo-lobby/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "start_round" }),
    });

    const response = await runCommand(request, context("demo-lobby"));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toBe("invalid_command");
  });

  it("returns game_not_found when lobby does not exist", async () => {
    const request = new Request("http://localhost/api/games/missing/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "reveal_question",
        payload: {},
      }),
    });

    const response = await runCommand(request, context("missing"));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(json.error).toBe("game_not_found");
  });

  it("runs a start_round command and exposes resulting state", async () => {
    await seedDemoLobby();

    const request = new Request("http://localhost/api/games/demo-lobby/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });

    const response = await runCommand(request, context("demo-lobby"));
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
});
