export const SESSION_COOKIE_NAME = "sdg_session";

type SessionPayload = {
  playerId: string;
  displayName: string;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createSession(displayName: string): SessionPayload {
  return {
    playerId: `p_${crypto.randomUUID()}`,
    displayName,
  };
}

export function encodeSessionCookieValue(session: SessionPayload): string {
  return toBase64Url(JSON.stringify(session));
}

export function decodeSessionCookieValue(value: string): SessionPayload | null {
  try {
    const raw = fromBase64Url(value);
    const parsed = JSON.parse(raw) as { playerId?: unknown; displayName?: unknown };
    if (typeof parsed.playerId !== "string" || typeof parsed.displayName !== "string") {
      return null;
    }
    return { playerId: parsed.playerId, displayName: parsed.displayName };
  } catch {
    return null;
  }
}

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

export function readSessionFromRequest(request: Request): SessionPayload | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const value = cookies[SESSION_COOKIE_NAME];
  if (value === undefined) {
    return null;
  }
  return decodeSessionCookieValue(value);
}
