import { NextResponse } from "next/server";

import { z } from "zod";

import { getRuntime } from "../../../../server/runtime";

const paramsSchema = z.object({
  lobbyId: z.string().min(1),
});

export async function GET(
  _request: Request,
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

  return NextResponse.json({
    lobbyId: state.value.lobbyId,
    status: state.value.status,
    phase: state.value.phase,
    completedRounds: state.value.completedRounds,
    plannedRounds: state.value.settings.plannedRounds,
    players: Object.values(state.value.players).map((player) => ({
      id: player.id,
      displayName: player.displayName,
      connected: player.connected,
      isHost: player.isHost,
    })),
    scoreboard: state.value.scoreboard,
    hasCurrentRound: state.value.currentRound !== null,
  });
}
