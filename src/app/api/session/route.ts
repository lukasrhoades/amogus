import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSession,
  encodeSessionCookieValue,
  readSessionFromRequest,
  SESSION_COOKIE_NAME,
} from "../../../server/session/session";

const createSessionSchema = z.object({
  displayName: z.string().min(1).max(64),
});

export async function GET(request: Request) {
  const session = readSessionFromRequest(request);
  if (session === null) {
    return NextResponse.json({ session: null });
  }
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  const parsed = createSessionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_session_request",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const session = createSession(parsed.data.displayName);
  const response = NextResponse.json({ session });
  response.cookies.set(SESSION_COOKIE_NAME, encodeSessionCookieValue(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
