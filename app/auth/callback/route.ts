import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Google sends the user back here; swap the one-time code for a session, then continue. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const code = searchParams.get("code");
  const authHeaders: Record<string, string> = {};

  if (code) {
    const supabase = await createClient((headers) => Object.assign(authHeaders, headers));
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`, { headers: authHeaders });
  }

  // Cancelled at Google, or the code was invalid or expired: back to sign-in with a message.
  const url = new URL("/login", origin);
  url.searchParams.set("error", "1");
  if (safeNext !== "/") url.searchParams.set("next", safeNext);
  return NextResponse.redirect(url, { headers: authHeaders });
}
