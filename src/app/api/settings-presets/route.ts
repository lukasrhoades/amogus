import { NextResponse } from "next/server";
import { z } from "zod";

import { getRuntime } from "../../../server/runtime";
import { requireSession } from "../../../server/session/require-session";

const configSchema = z.object({
  plannedRounds: z.number().int().min(5).max(30),
  roundsCappedByQuestions: z.boolean(),
  questionReuseEnabled: z.boolean(),
  impostorWeights: z.object({
    zero: z.number().min(0).max(1),
    one: z.number().min(0).max(1),
    two: z.number().min(0).max(1),
  }),
  scoring: z.object({
    impostorSurvivesPoints: z.number().int().min(0),
    crewVotesOutImpostorPoints: z.number().int().min(0),
    crewVotedOutPenaltyEnabled: z.boolean(),
    crewVotedOutPenaltyPoints: z.number().int().max(0),
  }),
});

const savePresetSchema = z.object({
  name: z.string().trim().min(1).max(32),
  config: configSchema,
});

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json({ error: "no_session", message: "Create a session before listing presets" }, { status: 401 });
  }

  const runtime = getRuntime();
  const presets = await runtime.settingsPresetService.listOwn(session.userId);
  return NextResponse.json({ ok: true, presets });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json({ error: "no_session", message: "Create a session before saving presets" }, { status: 401 });
  }

  const parsed = savePresetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_settings_preset", details: parsed.error.flatten() }, { status: 400 });
  }

  const runtime = getRuntime();
  const result = await runtime.settingsPresetService.saveOwn({
    ownerId: session.userId,
    name: parsed.data.name,
    config: parsed.data.config,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code, message: result.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, preset: result.value }, { status: 201 });
}
