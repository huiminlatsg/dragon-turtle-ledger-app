import { env, isSupabaseConfigured } from "@/lib/env";

export type DbStatus = "ok" | "not_configured" | "unreachable";

/** Pings Supabase's public health endpoint. */
export async function databaseStatus(): Promise<DbStatus> {
  if (!isSupabaseConfigured) return "not_configured";
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: env.supabaseAnonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
