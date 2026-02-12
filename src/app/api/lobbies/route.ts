import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../server/runtime";
import { createLobbyState } from "../../../server/lobby/defaults";
import { requireSession } from "../../../server/session/require-session";

const createLobbySchema = z.object({
  lobbyId: z.string().min(4).max(32),
});

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json(
      {
        error: "no_session",
        message: "Create a session before creating a lobby",
      },
      { status: 401 },
    );
  }

  const parsed = createLobbySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_lobby_create_request",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const runtime = getRuntime();
  const existing = await runtime.gameService.get(parsed.data.lobbyId);
  if (existing.ok) {
    return NextResponse.json(
      {
        error: "lobby_already_exists",
        message: `Lobby ${parsed.data.lobbyId} already exists`,
      },
      { status: 409 },
    );
  }

  const state = createLobbyState({
    lobbyId: parsed.data.lobbyId,
    hostPlayerId: session.userId,
    hostDisplayName: session.username,
  });
  await runtime.gameService.create(state);

  return NextResponse.json(
    {
      lobbyId: state.lobbyId,
      hostPlayerId: session.userId,
      playerCount: Object.keys(state.players).length,
      phase: state.phase,
    },
    { status: 201 },
  );
}
