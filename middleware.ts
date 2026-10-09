import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

/** Pages anyone can open without signing in. */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/google"];

/**
 * Refreshes the Supabase session on every request (so it doesn't expire while the
 * app sits on the home screen) and sends signed-out visitors to the sign-in page.
 */
export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });
  const copyAuthResponse = (target: NextResponse) => {
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) target.headers.set(name, value);
    }
    return target;
  };
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string> = {}) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = copyAuthResponse(NextResponse.next({ request }));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC_PATHS.includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return copyAuthResponse(NextResponse.redirect(url));
  }
  return response;
}

export const config = {
  // Everything except static files, icons, the manifest and the health check.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|mascot.svg|api/health).*)",
  ],
};
