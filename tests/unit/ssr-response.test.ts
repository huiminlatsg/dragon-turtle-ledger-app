import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), exchange: vi.fn(), callbackHeaders: {} as Record<string,string> }));
vi.mock("@/lib/env", () => ({ env: { supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "test-publishable-key" }, isSupabaseConfigured: true }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: any) => ({ auth: { getUser: () => mocks.getUser(options.cookies) } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async (onHeaders: (headers: Record<string,string>) => void) => ({ auth: { exchangeCodeForSession: async (code: string) => { onHeaders(mocks.callbackHeaders); return mocks.exchange(code); } } }) }));
import { middleware } from "@/middleware";
import { GET } from "@/app/auth/callback/route";
const headers = { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" };
beforeEach(() => { vi.clearAllMocks(); mocks.callbackHeaders = headers; });
describe("SSR response cookie and cache preservation", () => {
  it("preserves refresh headers and both cookie batches when setAll is called twice", async () => {
    mocks.getUser.mockImplementation(async (cookies: any) => {
      cookies.setAll([{ name: "session", value: "fresh", options: { path: "/" } }], headers);
      cookies.setAll([{ name: "verifier", value: "", options: { path: "/", maxAge: 0 } }], {});
      return { data: { user: { id: "test" } } };
    });
    const request = new NextRequest("https://app.example.com/accounts");
    const response = await middleware(request);
    expect(response.cookies.get("session")?.value).toBe("fresh");
    expect(response.cookies.get("verifier")?.maxAge).toBe(0);
    expect(request.cookies.get("session")?.value).toBe("fresh");
    for (const [name,value] of Object.entries(headers)) expect(response.headers.get(name)).toBe(value);
  });
  it("retains cookie removals and headers on signed-out redirects", async () => {
    mocks.getUser.mockImplementation(async (cookies: any) => {
      cookies.setAll([{ name: "session", value: "", options: { path: "/", maxAge: 0 } }], headers);
      return { data: { user: null } };
    });
    const response = await middleware(new NextRequest("https://app.example.com/accounts"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.com/login?next=%2Faccounts");
    expect(response.cookies.get("session")?.maxAge).toBe(0);
    expect(response.headers.get("cache-control")).toBe(headers["Cache-Control"]);
  });
  it.each([null, {message:"expired"}])("keeps supplied auth headers on callback success or failure (%j)", async error => {
    mocks.exchange.mockResolvedValue({error});
    const response = await GET(new NextRequest("https://app.example.com/auth/callback?code=one-time&next=/accounts"));
    expect(mocks.exchange).toHaveBeenCalledWith("one-time");
    for (const [name,value] of Object.entries(headers)) expect(response.headers.get(name)).toBe(value);
    expect(response.headers.get("location")).toBe(error ? "https://app.example.com/login?error=1&next=%2Faccounts" : "https://app.example.com/accounts");
  });
});
