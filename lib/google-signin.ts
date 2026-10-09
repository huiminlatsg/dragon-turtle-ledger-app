/**
 * Sign in with Google straight to Google's own sign-in address, so the account picker shows this app's
 * address instead of the long Supabase one. Google sends the person back to /auth/google with a signed ID
 * token in the address fragment (a normal link, which also works from the iPhone home-screen app); the
 * page there hands the token to Supabase (signInWithIdToken). Pure helpers here so they can be unit-tested.
 *
 * Google only returns to addresses listed under "Authorised redirect URIs" for the OAuth client
 * (docs/SETUP.md Part 6.5). Anywhere else, the sign-in page keeps the older redirect sign-in through
 * Supabase, so a preview that isn't listed still works.
 */

/** The OAuth client ID. Public by design (it appears in every Google sign-in URL); the secret is not here. */
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "736371536188-prs6k276cnoc3ktioauudgebpj71ltul.apps.googleusercontent.com";

/** Addresses whose `/auth/google` is registered with Google as a redirect URI. Add new ones here after adding them in Google Cloud. */
export const GOOGLE_ORIGINS: readonly string[] = [
  "https://dragon-turtle-ledger.vercel.app",
  "https://expensify-pi.vercel.app",
];

/** Short-lived cookies that carry the one-time values across the trip to Google and back. */
export const STATE_COOKIE = "gsi_state";
export const NONCE_COOKIE = "gsi_nonce";
export const NEXT_COOKIE = "gsi_next";
export const COOKIE_PATH = "/auth/google";

export function identityEnabled(origin: string, clientId: string = GOOGLE_CLIENT_ID, origins: readonly string[] = GOOGLE_ORIGINS) {
  return Boolean(clientId) && origins.includes(origin);
}

/** Only same-site paths, never another site. */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** A random value (hex), used for the state check and the nonce. */
export function randomHex(bytes = 32) {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The raw nonce goes to Supabase; Google gets its SHA-256, which ends up inside the signed token. */
export async function sha256Hex(text: string) {
  return toHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

/** Where to send the person to sign in at Google. Google returns here with #id_token=…&state=… */
export function googleAuthUrl(p: { clientId: string; redirectUri: string; state: string; nonceHash: string }) {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonceHash,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/** Reads what Google put after the # when it sent the person back. */
export function parseIdTokenHash(hash: string) {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  return { idToken: q.get("id_token"), state: q.get("state"), error: q.get("error") };
}

/** The state Google sent back must be the one we made before leaving. */
export function stateOk(expected: string | null | undefined, received: string | null | undefined) {
  return Boolean(expected) && Boolean(received) && expected === received;
}

/** Reads one cookie from a `document.cookie`-style string. */
export function readCookie(cookies: string, name: string) {
  for (const part of cookies.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
