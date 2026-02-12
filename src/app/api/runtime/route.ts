import { NextResponse } from "next/server";

import { getPrismaClient } from "../../../server/prisma-client";

type DbHealth =
  | { enabled: false }
  | { enabled: true; connected: true }
  | { enabled: true; connected: false; error: string };

function repoDriver(): "memory" | "prisma" | "auto" {
  const configured = process.env.GAME_SESSION_REPO;
  if (configured === "memory" || configured === "prisma" || configured === "auto") {
    return configured;
  }
  return "auto";
}

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
  const driver = repoDriver();
  const db = await checkDbHealth(driver);

  return NextResponse.json({
    repoDriver: driver,
    db,
  });
}
