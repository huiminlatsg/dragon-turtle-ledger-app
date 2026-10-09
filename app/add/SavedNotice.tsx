"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Shows "Saved" once, with an optional link (for example to add a receipt photo to what was just saved).
 * It then removes its parameters from the address, so a refresh starts clean.
 */
export function SavedNotice({ text, param = "saved", also = [], link }: { text: string; param?: string; also?: string[]; link?: { href: string; text: string } }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const name of [param, ...also]) {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <p className="badge" role="status" data-testid="saved">
      {text}
      {link && (
        <>
          {" "}
          <Link href={link.href} data-testid="add-receipt-link">
            {link.text}
          </Link>
        </>
      )}
    </p>
  );
}
