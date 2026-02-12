import { beforeEach, describe, expect, it } from "vitest";

import { POST as createLobby } from "../route";
import { POST as joinLobby } from "./join/route";
import { DELETE as deleteLobby } from "./route";
import { GET as getLobby } from "../../games/[lobbyId]/route";
import { resetRuntimeForTests } from "../../../../server/runtime";
import { authCookieFor } from "../../test-helpers/auth";

function headers(cookie?: string) {
  if (cookie === undefined) {
    return { "Content-Type": "application/json" };
  }
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
}

describe("lobbies delete route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("allows host to delete lobby", async () => {
    const hostCookie = await authCookieFor("host-1");
    const createRequest = new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: headers(hostCookie),
      body: JSON.stringify({ lobbyId: "alpha123" }),
    });
    const created = await createLobby(createRequest);
    expect(created.status).toBe(201);

    const deleteRequest = new Request("http://localhost/api/lobbies/alpha123", {
      method: "DELETE",
      headers: headers(hostCookie),
    });
    const deleted = await deleteLobby(deleteRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });
    expect(deleted.status).toBe(200);

    const read = await getLobby(new Request("http://localhost/api/games/alpha123", { headers: { Cookie: hostCookie } }), {
      params: Promise.resolve({ lobbyId: "alpha123" }),
    });
    expect(read.status).toBe(404);
  });

  it("rejects non-host delete", async () => {
    const hostCookie = await authCookieFor("host-1");
    const joinCookie = await authCookieFor("p2");
    const createRequest = new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: headers(hostCookie),
      body: JSON.stringify({ lobbyId: "alpha123" }),
    });
    await createLobby(createRequest);

    const joinRequest = new Request("http://localhost/api/lobbies/alpha123/join", {
      method: "POST",
      headers: headers(joinCookie),
      body: JSON.stringify({}),
    });
    await joinLobby(joinRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });

    const deleteRequest = new Request("http://localhost/api/lobbies/alpha123", {
      method: "DELETE",
      headers: headers(joinCookie),
    });
    const deleted = await deleteLobby(deleteRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });
    expect(deleted.status).toBe(403);
  });
});
