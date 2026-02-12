import { AuthRepo, AuthSessionRecord, AuthUser } from "../../ports/auth-repo";

export class InMemoryAuthRepo implements AuthRepo {
  private readonly usersById = new Map<string, AuthUser>();
  private readonly userIdsByUsername = new Map<string, string>();
  private readonly sessionsByToken = new Map<string, AuthSessionRecord>();

  async createUser(user: AuthUser): Promise<void> {
    this.usersById.set(user.id, user);
    this.userIdsByUsername.set(user.username, user.id);
  }

  async getUserByUsername(username: string): Promise<AuthUser | null> {
    const userId = this.userIdsByUsername.get(username);
    if (userId === undefined) {
      return null;
    }
    return this.usersById.get(userId) ?? null;
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    return this.usersById.get(userId) ?? null;
  }

  async createSession(record: AuthSessionRecord): Promise<void> {
    this.sessionsByToken.set(record.token, record);
  }

  async getSessionByToken(token: string): Promise<AuthSessionRecord | null> {
    return this.sessionsByToken.get(token) ?? null;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessionsByToken.delete(token);
  }
}
