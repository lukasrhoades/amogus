import { NextResponse } from "next/server";
import { z } from "zod";

import { getRuntime } from "../../../../server/runtime";
import { requireSession } from "../../../../server/session/require-session";

const paramsSchema = z.object({
  name: z.string().min(1),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json({ error: "no_session", message: "Create a session before deleting presets" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "invalid_params", details: params.error.flatten() }, { status: 400 });
  }

  const runtime = getRuntime();
  const result = await runtime.settingsPresetService.deleteOwn(session.userId, params.data.name);
  if (!result.ok) {
    const status = result.error.code === "preset_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error.code, message: result.error.message }, { status });
  }

  return NextResponse.json({ ok: true, deleted: true });
}
