import { POST as authPost } from "../session/route";

function extractCookie(setCookieHeader: string | null): string {
  const raw = setCookieHeader ?? "";
  const token = raw.split(";")[0] ?? "";
  return token;
}

export async function authCookieFor(username: string, password: string = "password123"): Promise<string> {
  const register = await authPost(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "register", username, password }),
    }),
  );

  if (register.status === 200) {
    return extractCookie(register.headers.get("set-cookie"));
  }

  const login = await authPost(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "login", username, password }),
    }),
  );
  if (login.status !== 200) {
    throw new Error(`Failed auth for ${username}`);
  }

  return extractCookie(login.headers.get("set-cookie"));
}
