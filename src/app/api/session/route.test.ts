import { describe, expect, it } from "vitest";

import { GET, POST } from "./route";

describe("session route", () => {
  it("creates a session cookie and returns session payload", async () => {
    const request = new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Lukas" }),
    });

    const response = await POST(request);
    const json = (await response.json()) as { session: { playerId: string; displayName: string } };

    expect(response.status).toBe(200);
    expect(json.session.displayName).toBe("Lukas");
    expect(json.session.playerId.startsWith("p_")).toBe(true);
    expect(response.headers.get("set-cookie")?.includes("sdg_session=")).toBe(true);
  });

  it("returns null when no session cookie exists", async () => {
    const response = await GET(new Request("http://localhost/api/session"));
    const json = (await response.json()) as { session: null };

    expect(response.status).toBe(200);
    expect(json.session).toBeNull();
  });
});
