import { beforeEach, describe, expect, it } from "vitest";

import { POST as createLobby } from "./route";
import { GET as getLobby } from "../games/[lobbyId]/route";
import { resetRuntimeForTests } from "../../../server/runtime";
import { authCookieFor } from "../test-helpers/auth";

describe("lobbies create route", () => {
  beforeEach(() => {
    process.env.GAME_SESSION_REPO = "memory";
    resetRuntimeForTests();
  });

  it("creates a lobby and allows reading it through game route", async () => {
    const hostCookie = await authCookieFor("host-1");
    const request = new Request("http://localhost/api/lobbies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: hostCookie,
      },
      body: JSON.stringify({
        lobbyId: "alpha123",
      }),
    });

    const response = await createLobby(request);
    const json = (await response.json()) as { lobbyId: string; playerCount: number };

    expect(response.status).toBe(201);
    expect(json.lobbyId).toBe("alpha123");
    expect(json.playerCount).toBe(1);

    const lobbyResponse = await getLobby(new Request("http://localhost/api/games/alpha123", { headers: { Cookie: hostCookie } }), {
      params: Promise.resolve({ lobbyId: "alpha123" }),
    });
    const lobbyJson = (await lobbyResponse.json()) as { players: Array<{ id: string; isHost: boolean }> };

    expect(lobbyResponse.status).toBe(200);
    expect(lobbyJson.players).toHaveLength(1);
    expect(lobbyJson.players[0]?.id).toBe("host-1");
    expect(lobbyJson.players[0]?.isHost).toBe(true);
  });
});
