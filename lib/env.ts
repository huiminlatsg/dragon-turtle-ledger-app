/**
 * Public settings, safe to ship to the browser. The anon key is designed to be
 * public: row-level security in the database is what protects the data.
 * Server-only secrets (service role key, Gemini key) are never read here.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Supabase calls this the "publishable" key (older projects: "anon" key). Either works.
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appEnv: (process.env.NEXT_PUBLIC_APP_ENV ?? "local") as "local" | "staging" | "production",
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** "Dragon Turtle Ledger" in production; "Dragon Turtle Ledger-staging" / "-local" elsewhere, so test versions are obvious. */
export const appName = env.appEnv === "production" ? "Dragon Turtle Ledger" : `Dragon Turtle Ledger-${env.appEnv}`;
/** Short label under the iPhone home-screen icon (iOS cuts long names). */
export const appShortName = env.appEnv === "production" ? "龙龟账本" : `龙龟-${env.appEnv}`;
