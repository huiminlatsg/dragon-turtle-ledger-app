"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type FormState } from "./actions";

/** Two taps to delete: the first asks for confirmation. Accounts with records can't be deleted. */
export function DeleteAccount({ id, text }: { id: string; text: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {confirming ? (
        <>
          <p className="hint">{text["acc.deleteConfirm"]}</p>
          <div className="actions">
            <button type="submit" className="danger" disabled={pending}>
              {text["acc.delete"]}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              {text["f.cancel"]}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="link-button danger-text" onClick={() => setConfirming(true)}>
          {text["acc.delete"]}
        </button>
      )}
      {state && (
        <p className="error" role="alert">
          {state.errors.map((e) => text[e] ?? e).join(" ")} {state.message}
        </p>
      )}
    </form>
  );
}
