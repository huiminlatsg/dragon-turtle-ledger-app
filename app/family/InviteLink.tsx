"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Text = Record<"create" | "creating" | "share" | "copy" | "copied" | "note" | "generic", string>;

/**
 * Creates a one-time invite link.
 *   member → /join/<token>         (join this family)
 *   family → /welcome?fi=<token>   (start a new, separate family; app admin only)
 */
export function InviteLink({ kind, text }: { kind: "member" | "family"; text: Text }) {
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } =
      kind === "member"
        ? await supabase.rpc("create_invite", { invite_role: "member" })
        : await supabase.rpc("create_family_invite", { invite_note: note.trim() || null });
    setBusy(false);
    if (error || typeof data !== "string") {
      setError(text.generic.replace("{message}", error?.message ?? "no link"));
      return;
    }
    const origin = window.location.origin;
    setLink(kind === "member" ? `${origin}/join/${data}` : `${origin}/welcome?fi=${data}`);
    setCopied(false);
  }

  return (
    <div>
      {kind === "family" && !link && (
        <>
          <label htmlFor="family-note">{text.note}</label>
          <input id="family-note" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      )}
      {link ? (
        <>
          <input className="link-output" readOnly value={link} onFocus={(e) => e.currentTarget.select()} data-testid={`invite-${kind}`} />
          <div className="actions">
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" className="primary" onClick={() => void navigator.share({ url: link })}>
                {text.share}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? text.copied : text.copy}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="primary" disabled={busy} onClick={() => void create()}>
          {busy ? text.creating : text.create}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
