import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "@/lib/env";

/** Supabase client for server components, route handlers and server actions. */
export async function createClient(onAuthHeaders?: (headers: Record<string, string>) => void) {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string> = {}) {
        onAuthHeaders?.(headers);
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only.
          // Session refresh is handled by middleware (added with login in Phase 1).
        }
      },
    },
  });
}
