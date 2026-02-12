import { beforeEach, describe, expect, it } from "vitest";

import { POST as createLobby } from "../../route";
import { POST as joinLobby } from "./route";
import { resetRuntimeForTests } from "../../../../../server/runtime";
import { authCookieFor } from "../../../test-helpers/auth";

describe("lobbies join route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("adds a player to an existing lobby", async () => {
    const hostCookie = await authCookieFor("host-1");
    const joinCookie = await authCookieFor("p2");
    const createRequest = new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: hostCookie,
      },
      body: JSON.stringify({
        lobbyId: "alpha123",
      }),
    });
    await createLobby(createRequest);

    const joinRequest = new Request("http://localhost/api/lobbies/alpha123/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: joinCookie,
      },
      body: JSON.stringify({}),
    });

    const response = await joinLobby(joinRequest, { params: Promise.resolve({ lobbyId: "alpha123" }) });
    const json = (await response.json()) as {
      ok: boolean;
      state: { players: Array<{ id: string; isHost: boolean }> };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.state.players).toHaveLength(2);
    expect(json.state.players.find((p) => p.id === "p2")?.isHost).toBe(false);
  });
});
