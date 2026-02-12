import { NextResponse } from "next/server";
import { z } from "zod";

import { getRuntime } from "../../../server/runtime";
import { requireSession } from "../../../server/session/require-session";

const promptTargetSchema = z.union([z.literal("crew"), z.literal("impostor"), z.literal("both")]);

const createQuestionPairSchema = z.object({
  promptA: z.object({
    text: z.string().min(1).max(240),
    target: promptTargetSchema,
  }),
  promptB: z.object({
    text: z.string().min(1).max(240),
    target: promptTargetSchema,
  }),
});

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json({ error: "no_session", message: "Create a session before listing question pairs" }, { status: 401 });
  }

  const runtime = getRuntime();
  const pairs = await runtime.questionPairService.listOwn(session.userId);
  return NextResponse.json({ ok: true, pairs });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (session === null) {
    return NextResponse.json({ error: "no_session", message: "Create a session before creating question pairs" }, { status: 401 });
  }

  const parsed = createQuestionPairSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_question_pair", details: parsed.error.flatten() }, { status: 400 });
  }

  const runtime = getRuntime();
  const result = await runtime.questionPairService.createOwn({
    ownerId: session.userId,
    promptA: {
      text: parsed.data.promptA.text.trim(),
      target: parsed.data.promptA.target,
    },
    promptB: {
      text: parsed.data.promptB.text.trim(),
      target: parsed.data.promptB.target,
    },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code, message: result.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, pair: result.value }, { status: 201 });
}
