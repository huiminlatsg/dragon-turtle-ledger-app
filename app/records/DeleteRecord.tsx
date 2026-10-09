"use client";

import { useActionState, useState } from "react";
import { deleteRecord, type RecordState } from "./actions";

/** Two taps to delete: the first asks for confirmation and says what else changes. */
export function DeleteRecord({ id, warning, text }: { id: string; warning: string | null; text: Record<string, string> }) {
  const [state, action, pending] = useActionState<RecordState, FormData>(deleteRecord, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} data-testid="delete-record">
      <input type="hidden" name="id" value={id} />
      {confirming ? (
        <>
          <p className="hint">{text["rec.deleteConfirm"]}</p>
          {warning && <p className="hint">{warning}</p>}
          <div className="actions">
            <button type="submit" className="danger" disabled={pending} data-testid="delete-confirm">
              {text["rec.delete"]}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              {text["f.cancel"]}
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="link-button danger-text" onClick={() => setConfirming(true)} data-testid="delete-start">
          {text["rec.delete"]}
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
