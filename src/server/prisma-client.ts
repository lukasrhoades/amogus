import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = Symbol.for("sdg.prisma-client");

type GlobalWithPrisma = typeof globalThis & {
  [prismaClientSingleton]?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  const globalRef = globalThis as GlobalWithPrisma;
  if (globalRef[prismaClientSingleton] === undefined) {
    globalRef[prismaClientSingleton] = new PrismaClient();
  }
  return globalRef[prismaClientSingleton];
}
