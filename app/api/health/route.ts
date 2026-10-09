import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { databaseStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Used by the post-deploy smoke test. */
export async function GET() {
  const database = await databaseStatus();
  return NextResponse.json(
    { ok: database !== "unreachable", version: env.version, environment: env.appEnv, database },
    { status: database === "unreachable" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
