import { NextResponse } from "next/server";

import { getConfiguredRepoDriverMode } from "../../../server/runtime";
import { getPrismaClient } from "../../../server/prisma-client";

type DbHealth =
  | { enabled: false }
  | { enabled: true; connected: true }
  | { enabled: true; connected: false; error: string };

async function checkDbHealth(driver: "memory" | "prisma" | "auto"): Promise<DbHealth> {
  if (driver === "memory") {
    return { enabled: false };
  }

  try {
    await getPrismaClient().$queryRawUnsafe("SELECT 1");
    return { enabled: true, connected: true };
  } catch (error) {
    return {
      enabled: true,
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET() {
  const driver = getConfiguredRepoDriverMode();
  const db = await checkDbHealth(driver);

  return NextResponse.json({
    repoDriver: driver,
    productionRequiresPrisma: process.env.NODE_ENV === "production",
    db,
  });
}
