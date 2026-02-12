import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../../../server/runtime";
import { addPlayerToLobbyState } from "../../../../../server/lobby/defaults";
import { serializeGameState } from "../../../../../server/serialize-game-state";
import { requireSession } from "../../../../../server/session/require-session";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json(
      {
        error: "no_session",
        message: "Create a session before joining a lobby",
      },
      { status: 401 },
    );
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json(
      {
        error: "invalid_params",
        details: params.error.flatten(),
      },
      { status: 400 },
    );
  }

  const runtime = getRuntime();
  const current = await runtime.gameService.get(params.data.lobbyId);
  if (!current.ok) {
    return NextResponse.json(
      {
        error: current.error.code,
        message: current.error.message,
      },
      { status: 404 },
    );
  }

  const next = addPlayerToLobbyState(current.value, {
    playerId: session.userId,
    displayName: session.username,
  });
  await runtime.gameService.create(next);

  return NextResponse.json({
    ok: true,
    state: serializeGameState(next),
  });
}
