import { beforeEach, describe, expect, it } from "vitest";

import { DELETE, GET, POST } from "./route";
import { resetRuntimeForTests } from "../../../server/runtime";

describe("session route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("registers user, sets session cookie, and returns session payload", async () => {
    const request = new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "register", username: "lukas", password: "password123" }),
    });

    const response = await POST(request);
    const json = (await response.json()) as { session: { userId: string; username: string } };

    expect(response.status).toBe(200);
    expect(json.session.username).toBe("lukas");
    expect(json.session.userId).toBe("lukas");
    expect(response.headers.get("set-cookie")?.includes("sdg_session=")).toBe(true);
  });

  it("returns current authenticated session for cookie token", async () => {
    const auth = await POST(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "register", username: "avery", password: "password123" }),
      }),
    );
    const cookie = auth.headers.get("set-cookie")?.split(";")[0] ?? "";

    const response = await GET(new Request("http://localhost/api/session", { headers: { Cookie: cookie } }));
    const json = (await response.json()) as { session: { userId: string; username: string } | null };

    expect(response.status).toBe(200);
    expect(json.session?.userId).toBe("avery");
  });

  it("logs out and clears cookie", async () => {
    const response = await DELETE(new Request("http://localhost/api/session", { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")?.includes("Max-Age=0")).toBe(true);
  });
});
