"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Text = Record<"yourName" | "yourNamePlaceholder" | "join" | "joining" | "invalid" | "generic", string>;

export function JoinForm({ token, text }: { token: string; text: Text }) {
  const router = useRouter();
  const [yourName, setYourName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("accept_invite", {
      invite_token: token,
      my_display_name: yourName.trim(),
    });
    if (error) {
      setBusy(false);
      setError(error.message.includes("invite is invalid") ? text.invalid : text.generic.replace("{message}", error.message));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void join();
      }}
    >
      <label htmlFor="yourName">{text.yourName}</label>
      <input
        id="yourName"
        required
        maxLength={40}
        autoComplete="nickname"
        placeholder={text.yourNamePlaceholder}
        value={yourName}
        onChange={(e) => setYourName(e.target.value)}
      />
      <button type="submit" className="primary" disabled={busy || !yourName.trim()}>
        {busy ? text.joining : text.join}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
