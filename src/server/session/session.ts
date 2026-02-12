export const SESSION_COOKIE_NAME = "sdg_session";

function parseCookieHeader(header: string | null): Record<string, string> {
  if (header === null || header.trim() === "") {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim();
    if (key !== undefined && key !== "") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function readSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE_NAME];
  if (token === undefined || token.trim() === "") {
    return null;
  }
  return token;
}
