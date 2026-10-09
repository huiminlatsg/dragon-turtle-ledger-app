"use client";

/** Last-resort screen: shows what failed instead of a blank "application error" page. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Something went wrong</h1>
        <p data-testid="global-error">
          {error.message}
          {error.digest ? ` (ref ${error.digest})` : ""}
        </p>
        <p>
          <a href="/">Back to Home</a>
        </p>
      </body>
    </html>
  );
}
