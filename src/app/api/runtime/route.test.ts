import { describe, expect, it } from "vitest";

import { GET } from "./route";
import { resetRuntimeForTests } from "../../../server/runtime";

describe("runtime route", () => {
  it("reports memory mode when explicitly configured", async () => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();

    const response = await GET();
    const json = (await response.json()) as {
      repoDriver: string;
      productionRequiresPrisma: boolean;
      db: { enabled: boolean };
    };

    expect(response.status).toBe(200);
    expect(json.repoDriver).toBe("memory");
    expect(json.productionRequiresPrisma).toBe(false);
    expect(json.db.enabled).toBe(false);
  });
});
