import { describe, expect, it } from "vitest";
import { googleAuthUrl, identityEnabled, parseIdTokenHash, randomHex, readCookie, safeNext, sha256Hex, stateOk } from "@/lib/google-signin";

describe("identityEnabled", () => {
  const origins = ["https://app.example.com"];
  it("needs a client ID and a registered address", () => {
    expect(identityEnabled("https://app.example.com", "abc.apps.googleusercontent.com", origins)).toBe(true);
    expect(identityEnabled("https://app.example.com", "", origins)).toBe(false);
    expect(identityEnabled("https://other.vercel.app", "abc", origins)).toBe(false);
    expect(identityEnabled("http://localhost:3000", "abc", origins)).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps same-site paths only", () => {
    expect(safeNext("/accounts?x=1")).toBe("/accounts?x=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});

describe("googleAuthUrl", () => {
  it("asks Google for an ID token and comes back to our own address", () => {
    const url = new URL(googleAuthUrl({ clientId: "cid", redirectUri: "https://app.example.com/auth/google", state: "s1", nonceHash: "n1" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "cid",
      redirect_uri: "https://app.example.com/auth/google",
      response_type: "id_token",
      scope: "openid email profile",
      state: "s1",
      nonce: "n1",
      prompt: "select_account",
    });
  });
});

describe("parseIdTokenHash", () => {
  it("reads the token, state and error Google puts after the #", () => {
    expect(parseIdTokenHash("#id_token=abc.def&state=s1")).toEqual({ idToken: "abc.def", state: "s1", error: null });
    expect(parseIdTokenHash("#error=access_denied&state=s1")).toEqual({ idToken: null, state: "s1", error: "access_denied" });
    expect(parseIdTokenHash("")).toEqual({ idToken: null, state: null, error: null });
  });
});

describe("stateOk", () => {
  it("needs both values present and equal", () => {
    expect(stateOk("abc", "abc")).toBe(true);
    expect(stateOk("abc", "abd")).toBe(false);
    expect(stateOk(undefined, undefined)).toBe(false);
    expect(stateOk("", "")).toBe(false);
    expect(stateOk("abc", null)).toBe(false);
  });
});

describe("readCookie", () => {
  it("finds one cookie by name", () => {
    expect(readCookie("a=1; gsi_state=xyz; b=2", "gsi_state")).toBe("xyz");
    expect(readCookie("a=1", "gsi_state")).toBeUndefined();
    expect(readCookie("gsi_next=%2Faccounts%3Fx%3D1", "gsi_next")).toBe("%2Faccounts%3Fx%3D1");
  });
});

describe("random values", () => {
  it("are random hex, and hashing matches the standard SHA-256 test value", async () => {
    const a = randomHex();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(randomHex()).not.toBe(a);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
