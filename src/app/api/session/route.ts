import { NextResponse } from "next/server";
import { z } from "zod";

import { getRuntime } from "../../../server/runtime";
import { readSessionTokenFromRequest, SESSION_COOKIE_NAME } from "../../../server/session/session";

const authSchema = z.object({
  mode: z.union([z.literal("register"), z.literal("login")]),
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

export async function GET(request: Request) {
  const token = readSessionTokenFromRequest(request);
  if (token === null) {
    return NextResponse.json({ session: null });
  }

  const identity = await getRuntime().authService.getSessionIdentity(token);
  if (identity === null) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({
    session: {
      userId: identity.userId,
      username: identity.username,
    },
  });
}

export async function POST(request: Request) {
  const parsed = authSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_auth_request",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const auth =
    parsed.data.mode === "register"
      ? await getRuntime().authService.registerAndCreateSession(parsed.data.username, parsed.data.password)
      : await getRuntime().authService.loginAndCreateSession(parsed.data.username, parsed.data.password);

  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.error.code,
        message: auth.error.message,
      },
      { status: auth.error.code === "user_exists" ? 409 : 401 },
    );
  }

  const response = NextResponse.json({
    session: {
      userId: auth.value.identity.userId,
      username: auth.value.identity.username,
    },
  });
  response.cookies.set(SESSION_COOKIE_NAME, auth.value.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE(request: Request) {
  const token = readSessionTokenFromRequest(request);
  if (token !== null) {
    await getRuntime().authService.logout(token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
