import { randomUUID } from "node:crypto";

import { AuthRepo } from "../ports/auth-repo";
import { hashPassword, verifyPassword } from "../server/auth/password";

export type SessionIdentity = {
  userId: string;
  username: string;
};

export type AuthResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: "invalid_credentials" | "user_exists" | "session_invalid";
        message: string;
      };
    };

function ok<T>(value: T): AuthResult<T> {
  return { ok: true, value };
}

function err<T>(code: "invalid_credentials" | "user_exists" | "session_invalid", message: string): AuthResult<T> {
  return { ok: false, error: { code, message } };
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepo,
    private readonly nowMs: () => number = Date.now,
  ) {}

  async registerAndCreateSession(username: string, password: string): Promise<AuthResult<{ token: string; identity: SessionIdentity }>> {
    const normalized = username.trim().toLowerCase();
    const existing = await this.repo.getUserByUsername(normalized);
    if (existing !== null) {
      return err("user_exists", "Username already exists");
    }

    const userId = normalized;
    await this.repo.createUser({
      id: userId,
      username: normalized,
      passwordHash: hashPassword(password),
    });

    return this.createSessionForUser(userId, normalized);
  }

  async loginAndCreateSession(username: string, password: string): Promise<AuthResult<{ token: string; identity: SessionIdentity }>> {
    const normalized = username.trim().toLowerCase();
    const user = await this.repo.getUserByUsername(normalized);
    if (user === null || !verifyPassword(password, user.passwordHash)) {
      return err("invalid_credentials", "Invalid username or password");
    }

    return this.createSessionForUser(user.id, user.username);
  }

  async getSessionIdentity(token: string): Promise<SessionIdentity | null> {
    const session = await this.repo.getSessionByToken(token);
    if (session === null) {
      return null;
    }

    if (session.expiresAt.getTime() <= this.nowMs()) {
      await this.repo.deleteSession(token);
      return null;
    }

    const user = await this.repo.getUserById(session.userId);
    if (user === null) {
      await this.repo.deleteSession(token);
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
    };
  }

  async logout(token: string): Promise<void> {
    await this.repo.deleteSession(token);
  }

  private async createSessionForUser(
    userId: string,
    username: string,
  ): Promise<AuthResult<{ token: string; identity: SessionIdentity }>> {
    const token = randomUUID();
    const expiresAt = new Date(this.nowMs() + 1000 * 60 * 60 * 24 * 30);
    await this.repo.createSession({ token, userId, expiresAt });
    return ok({ token, identity: { userId, username } });
  }
}
