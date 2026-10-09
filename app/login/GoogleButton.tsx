"use client";

import { useState } from "react";
import {
  COOKIE_PATH,
  GOOGLE_CLIENT_ID,
  NEXT_COOKIE,
  NONCE_COOKIE,
  STATE_COOKIE,
  googleAuthUrl,
  identityEnabled,
  randomHex,
  sha256Hex,
} from "@/lib/google-signin";
import { createClient } from "@/lib/supabase/client";

/**
 * Starts Google sign-in. On the registered addresses it goes straight to Google and comes back to
 * /auth/google, so Google's account picker names this app's address. Anywhere else it uses the redirect
 * sign-in through Supabase, which returns to /auth/callback. Both finish inside the same app (not in Safari).
 */
export function GoogleButton({ next, label, busyLabel, failed }: { next: string; label: string; busyLabel: string; failed: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function viaGoogle() {
    const state = randomHex();
    const nonce = randomHex();
    const attrs = `Max-Age=600; Path=${COOKIE_PATH}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    document.cookie = `${STATE_COOKIE}=${state}; ${attrs}`;
    document.cookie = `${NONCE_COOKIE}=${nonce}; ${attrs}`;
    document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(next)}; ${attrs}`;
    window.location.assign(
      googleAuthUrl({ clientId: GOOGLE_CLIENT_ID, redirectUri: `${window.location.origin}/auth/google`, state, nonceHash: await sha256Hex(nonce) }),
    );
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    if (identityEnabled(window.location.origin)) {
      viaGoogle().catch((e: Error) => {
        setBusy(false);
        setError(failed.replace("{message}", e.message));
      });
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setBusy(false);
      setError(failed.replace("{message}", error.message));
    }
  }

  return (
    <>
      <button type="button" className="google-button" disabled={busy} onClick={() => void signIn()}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
          <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        <span>{busy ? busyLabel : label}</span>
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
