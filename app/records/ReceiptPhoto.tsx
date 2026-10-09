"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RECEIPT_JPEG_QUALITY, RECEIPT_MAX_BYTES, RECEIPT_MAX_EDGE, fitWithin, receiptPath } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/client";
import { attachReceipt, removeReceipt } from "./actions";

/** Shrinks a photo in the browser (longest side 1600 px, JPEG), so uploads are quick on mobile data and storage stays small. */
async function shrink(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers: load it as an image, which applies the camera's rotation itself.
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("unreadable image"));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const natural = "naturalWidth" in source ? { w: source.naturalWidth, h: source.naturalHeight } : { w: source.width, h: source.height };
  const { width, height } = fitWithin(natural.w, natural.h, RECEIPT_MAX_EDGE);
  if (!width) throw new Error("empty image");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(source, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode"))), "image/jpeg", RECEIPT_JPEG_QUALITY));
}

type Props = {
  recordId: string;
  householdId: string;
  /** Temporary link to the current photo, or null when there is none. */
  url: string | null;
  canChange: boolean;
  text: Record<string, string>;
};

export function ReceiptPhoto({ recordId, householdId, url, canChange, text }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function upload(file: File) {
    setError(null);
    setBusy("upload");
    try {
      const blob = await shrink(file);
      if (blob.size > RECEIPT_MAX_BYTES) throw new Error("too big");
      const path = receiptPath(householdId, recordId, crypto.randomUUID());
      const { error: uploadError } = await createClient().storage.from("receipts").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const result = await attachReceipt(recordId, path);
      if (result) throw new Error(result.errors.map((e) => text[e] ?? e).join(" ") || result.message || "failed");
      router.refresh();
    } catch (e) {
      setError(`${text["err.receipt"]}${e instanceof Error && e.message ? ` (${e.message})` : ""}`);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = ""; // allow choosing the same photo again
    }
  }

  async function remove() {
    setError(null);
    setBusy("remove");
    try {
      const result = await removeReceipt(recordId);
      if (result) throw new Error(result.errors.map((e) => text[e] ?? e).join(" ") || result.message || "failed");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="receipt-photo">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" data-testid="receipt-link">
          <img src={url} alt={text["rec.receipt"]} className="receipt-img" />
        </a>
      ) : (
        <p className="muted">{text["rec.receiptNone"]}</p>
      )}

      {canChange && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            data-testid="receipt-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <div className="actions">
            <button type="button" className="secondary" disabled={busy !== null} onClick={() => input.current?.click()} data-testid="receipt-choose">
              {busy === "upload" ? text["rec.receiptUploading"] : url ? text["rec.receiptReplace"] : text["rec.receiptAdd"]}
            </button>
            {url && !confirming && (
              <button type="button" className="link-button danger-text" disabled={busy !== null} onClick={() => setConfirming(true)}>
                {text["rec.receiptRemove"]}
              </button>
            )}
          </div>
          {confirming && (
            <div>
              <p className="hint">{text["rec.receiptRemoveConfirm"]}</p>
              <div className="actions">
                <button type="button" className="danger" disabled={busy !== null} onClick={() => void remove()} data-testid="receipt-remove-confirm">
                  {text["rec.receiptRemove"]}
                </button>
                <button type="button" className="secondary" onClick={() => setConfirming(false)}>
                  {text["f.cancel"]}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
