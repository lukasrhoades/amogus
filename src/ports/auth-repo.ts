export type AuthUser = {
  id: string;
  username: string;
  passwordHash: string;
};

export type AuthSessionRecord = {
  token: string;
  userId: string;
  expiresAt: Date;
};

export interface AuthRepo {
  createUser(user: AuthUser): Promise<void>;
  getUserByUsername(username: string): Promise<AuthUser | null>;
  getUserById(userId: string): Promise<AuthUser | null>;
  createSession(record: AuthSessionRecord): Promise<void>;
  getSessionByToken(token: string): Promise<AuthSessionRecord | null>;
  deleteSession(token: string): Promise<void>;
}
