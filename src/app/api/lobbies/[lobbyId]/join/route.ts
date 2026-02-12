import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../../../server/runtime";
import { addPlayerToLobbyState } from "../../../../../server/lobby/defaults";
import { serializeGameState } from "../../../../../server/serialize-game-state";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

const joinLobbySchema = z.object({
  playerId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64),
});

export async function POST(
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

  const parsed = joinLobbySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_join_request",
        details: parsed.error.flatten(),
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

  const next = addPlayerToLobbyState(current.value, parsed.data);
  await runtime.gameService.create(next);

  return NextResponse.json({
    ok: true,
    state: serializeGameState(next),
  });
}
