import { beforeEach, describe, expect, it } from "vitest";

import { POST as createLobby } from "../route";
import { POST as joinLobby } from "./join/route";
import { DELETE as deleteLobby } from "./route";
import { GET as getLobby } from "../../games/[lobbyId]/route";
import { resetRuntimeForTests } from "../../../../server/runtime";
import { encodeSessionCookieValue } from "../../../../server/session/session";

const hostSession = { playerId: "host-1", displayName: "Host" };
const joinSession = { playerId: "p2", displayName: "Avery" };

function headers(session?: { playerId: string; displayName: string }) {
  if (session === undefined) {
    return { "Content-Type": "application/json" };
  }
  return {
    "Content-Type": "application/json",
    Cookie: `sdg_session=${encodeSessionCookieValue(session)}`,
  };
}

describe("lobbies delete route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("allows host to delete lobby", async () => {
    const createRequest = new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: headers(hostSession),
      body: JSON.stringify({ lobbyId: "alpha123" }),
    });
    const created = await createLobby(createRequest);
    expect(created.status).toBe(201);

    const deleteRequest = new Request("http://localhost/api/lobbies/alpha123", {
      method: "DELETE",
      headers: headers(hostSession),
    });
    const deleted = await deleteLobby(deleteRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });
    expect(deleted.status).toBe(200);

    const read = await getLobby(new Request("http://localhost/api/games/alpha123"), {
      params: Promise.resolve({ lobbyId: "alpha123" }),
    });
    expect(read.status).toBe(404);
  });

  it("rejects non-host delete", async () => {
    const createRequest = new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: headers(hostSession),
      body: JSON.stringify({ lobbyId: "alpha123" }),
    });
    await createLobby(createRequest);

    const joinRequest = new Request("http://localhost/api/lobbies/alpha123/join", {
      method: "POST",
      headers: headers(joinSession),
      body: JSON.stringify({}),
    });
    await joinLobby(joinRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });

    const deleteRequest = new Request("http://localhost/api/lobbies/alpha123", {
      method: "DELETE",
      headers: headers(joinSession),
    });
    const deleted = await deleteLobby(deleteRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });
    expect(deleted.status).toBe(403);
  });
});
