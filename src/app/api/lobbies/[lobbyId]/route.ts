import { NextResponse } from "next/server";
import { z } from "zod";

import { getRuntime } from "../../../../server/runtime";
import { readSessionFromRequest } from "../../../../server/session/session";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
  const session = readSessionFromRequest(request);
  if (session === null) {
    return NextResponse.json(
      {
        error: "no_session",
        message: "Create a session before deleting a lobby",
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

  const caller = current.value.players[session.playerId];
  if (caller === undefined || !caller.isHost) {
    return NextResponse.json(
      {
        error: "forbidden",
        message: "Only the host can delete this lobby",
      },
      { status: 403 },
    );
  }

  const deleted = await runtime.gameService.deleteLobby(params.data.lobbyId);
  if (!deleted.ok) {
    return NextResponse.json(
      {
        error: deleted.error.code,
        message: deleted.error.message,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, deleted: true });
}
