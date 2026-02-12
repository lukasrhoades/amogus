import { NextResponse } from "next/server";
import { z } from "zod";

import { getRuntime } from "../../../../server/runtime";
import { readSessionFromRequest } from "../../../../server/session/session";

const paramsSchema = z.object({
  pairId: z.string().min(1),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ pairId: string }> },
) {
  const session = readSessionFromRequest(request);
  if (session === null) {
    return NextResponse.json({ error: "no_session", message: "Create a session before deleting question pairs" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "invalid_params", details: params.error.flatten() }, { status: 400 });
  }

  const runtime = getRuntime();
  const result = await runtime.questionPairService.deleteOwn(session.playerId, params.data.pairId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code, message: result.error.message }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: true });
}
