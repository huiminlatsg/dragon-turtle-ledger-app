"use client";

import Link from "next/link";

/** Keeps a failure on the Add screen readable instead of a blank "application error" page. */
export default function AddError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <h1>Add expense</h1>
      <div className="error" role="alert" data-testid="add-error">
        <p>Something went wrong on this screen.</p>
        <p className="small">
          {error.message}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </p>
      </div>
      <button type="button" className="primary" onClick={() => reset()}>
        Try again
      </button>
      <Link href="/" className="secondary button-link">
        Home
      </Link>
    </main>
  );
}
