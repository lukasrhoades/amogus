import { PrismaClient } from "@prisma/client";

import { AuthRepo, AuthSessionRecord, AuthUser } from "../../ports/auth-repo";

export class PrismaAuthRepo implements AuthRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(user: AuthUser): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
      },
    });
  }

  async getUserByUsername(username: string): Promise<AuthUser | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
    };
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
    };
  }

  async createSession(record: AuthSessionRecord): Promise<void> {
    await this.prisma.authSession.upsert({
      where: { token: record.token },
      update: {
        userId: record.userId,
        expiresAt: record.expiresAt,
      },
      create: {
        token: record.token,
        userId: record.userId,
        expiresAt: record.expiresAt,
      },
    });
  }

  async getSessionByToken(token: string): Promise<AuthSessionRecord | null> {
    const row = await this.prisma.authSession.findUnique({ where: { token } });
    if (row === null) {
      return null;
    }
    return {
      token: row.token,
      userId: row.userId,
      expiresAt: row.expiresAt,
    };
  }

  async deleteSession(token: string): Promise<void> {
    await this.prisma.authSession.deleteMany({ where: { token } });
  }
}
