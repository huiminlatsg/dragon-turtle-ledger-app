"use client";

import { useActionState, useState } from "react";
import { deleteLedger, type LedgerFormState } from "./actions";

/** Two taps to delete: the first asks for confirmation. Ledgers with records can't be deleted. */
export function DeleteLedger({ id, text }: { id: string; text: Record<string, string> }) {
  const [state, action, pending] = useActionState<LedgerFormState, FormData>(deleteLedger, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {confirming ? (
        <>
          <p className="hint">{text["led.deleteConfirm"]}</p>
          <div className="actions">
            <button type="submit" className="danger" disabled={pending}>
              {text["led.delete"]}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              {text["f.cancel"]}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="link-button danger-text" onClick={() => setConfirming(true)}>
          {text["led.delete"]}
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
