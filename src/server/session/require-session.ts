import { getRuntime } from "../runtime";
import { readSessionTokenFromRequest } from "./session";

export type RequestSession = {
  userId: string;
  username: string;
  token: string;
};

export async function requireSession(request: Request): Promise<RequestSession | null> {
  const token = readSessionTokenFromRequest(request);
  if (token === null) {
    return null;
  }

  const identity = await getRuntime().authService.getSessionIdentity(token);
  if (identity === null) {
    return null;
  }

  return {
    userId: identity.userId,
    username: identity.username,
    token,
  };
}
