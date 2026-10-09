"use client";

import { useEffect } from "react";
import { COOKIE_PATH, NEXT_COOKIE, NONCE_COOKIE, STATE_COOKIE, parseIdTokenHash, readCookie, safeNext, stateOk } from "@/lib/google-signin";
import { createClient } from "@/lib/supabase/client";

/** Checks the way back from Google is the one we started, then signs in to Supabase and goes on to the wanted page. */
export function FinishGoogleSignIn() {
  useEffect(() => {
    const { idToken, state, error } = parseIdTokenHash(window.location.hash);
    const expectedState = readCookie(document.cookie, STATE_COOKIE);
    const nonce = readCookie(document.cookie, NONCE_COOKIE);
    let next = "/";
    try {
      next = safeNext(decodeURIComponent(readCookie(document.cookie, NEXT_COOKIE) ?? ""));
    } catch {
      // malformed cookie: go home
    }
    for (const name of [STATE_COOKIE, NONCE_COOKIE, NEXT_COOKIE]) document.cookie = `${name}=; Max-Age=0; Path=${COOKIE_PATH}`;
    history.replaceState(null, "", window.location.pathname); // keep the token out of the address bar and history

    const fail = () => {
      const q = new URLSearchParams({ error: "1" });
      if (next !== "/") q.set("next", next);
      window.location.replace(`/login?${q.toString()}`);
    };

    if (error || !idToken || !nonce || !stateOk(expectedState, state)) return fail();
    void createClient()
      .auth.signInWithIdToken({ provider: "google", token: idToken, nonce })
      .then(({ error: e }) => (e ? fail() : window.location.replace(next)))
      .catch(fail);
  }, []);
  return null;
}
