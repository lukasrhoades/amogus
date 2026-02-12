import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../../server/runtime";
import { serializeGameState } from "../../../../server/serialize-game-state";
import { readSessionFromRequest } from "../../../../server/session/session";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ lobbyId: string }> },
) {
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
  const state = await runtime.gameService.get(params.data.lobbyId);
  if (!state.ok) {
    return NextResponse.json(
      {
        error: state.error.code,
        message: state.error.message,
      },
      { status: 404 },
    );
  }

  const session = readSessionFromRequest(request);
  return NextResponse.json(serializeGameState(state.value, session?.playerId));
}
