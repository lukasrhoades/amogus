import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("runtime route", () => {
  it("reports memory mode when explicitly configured", async () => {
    process.env.GAME_SESSION_REPO = "memory";

    const response = await GET();
    const json = (await response.json()) as {
      repoDriver: string;
      db: { enabled: boolean };
    };

    expect(response.status).toBe(200);
    expect(json.repoDriver).toBe("memory");
    expect(json.db.enabled).toBe(false);
  });
});
