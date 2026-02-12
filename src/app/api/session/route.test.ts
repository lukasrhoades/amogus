import { describe, expect, it } from "vitest";

import { GET, POST } from "./route";
import { encodeSessionCookieValue } from "../../../server/session/session";

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

  it("prefers explicit session header over cookie", async () => {
    const headerSession = { playerId: "p_header", displayName: "Header" };
    const cookieSession = { playerId: "p_cookie", displayName: "Cookie" };

    const response = await GET(
      new Request("http://localhost/api/session", {
        headers: {
          "x-sdg-session": encodeSessionCookieValue(headerSession),
          Cookie: `sdg_session=${encodeSessionCookieValue(cookieSession)}`,
        },
      }),
    );
    const json = (await response.json()) as { session: { playerId: string; displayName: string } | null };

    expect(response.status).toBe(200);
    expect(json.session?.playerId).toBe("p_header");
  });
});
