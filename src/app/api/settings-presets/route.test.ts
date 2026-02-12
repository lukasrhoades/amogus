import { beforeEach, describe, expect, it } from "vitest";

import { DELETE as deletePreset } from "./[name]/route";
import { GET as listPresets, POST as savePreset } from "./route";
import { resetRuntimeForTests } from "../../../server/runtime";
import { authCookieFor } from "../test-helpers/auth";

function authHeaders(cookie: string) {
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
}

describe("settings preset routes", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("includes DEFAULT and allows save/list/delete for own presets", async () => {
    const cookie = await authCookieFor("p1");

    const initialList = await listPresets(
      new Request("http://localhost/api/settings-presets", {
        method: "GET",
        headers: authHeaders(cookie),
      }),
    );
    const initialJson = (await initialList.json()) as { presets: Array<{ name: string }> };
    expect(initialList.status).toBe(200);
    expect(initialJson.presets.some((preset) => preset.name === "DEFAULT")).toBe(true);

    const saved = await savePreset(
      new Request("http://localhost/api/settings-presets", {
        method: "POST",
        headers: authHeaders(cookie),
        body: JSON.stringify({
          name: "FAST",
          config: {
            plannedRounds: 8,
            roundsCappedByQuestions: false,
            questionReuseEnabled: false,
            impostorWeights: { zero: 0.025, one: 0.95, two: 0.025 },
            scoring: {
              impostorSurvivesPoints: 3,
              crewVotesOutImpostorPoints: 1,
              crewVotedOutPenaltyEnabled: true,
              crewVotedOutPenaltyPoints: -1,
            },
          },
        }),
      }),
    );
    expect(saved.status).toBe(201);

    const listed = await listPresets(
      new Request("http://localhost/api/settings-presets", {
        method: "GET",
        headers: authHeaders(cookie),
      }),
    );
    const listedJson = (await listed.json()) as { presets: Array<{ name: string }> };
    expect(listedJson.presets.some((preset) => preset.name === "FAST")).toBe(true);

    const deleted = await deletePreset(
      new Request("http://localhost/api/settings-presets/FAST", {
        method: "DELETE",
        headers: authHeaders(cookie),
      }),
      { params: Promise.resolve({ name: "FAST" }) },
    );
    expect(deleted.status).toBe(200);
  });
});
