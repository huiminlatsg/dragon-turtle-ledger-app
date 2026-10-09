/**
 * Receipt photos: where they are stored and how big they are. Pure functions.
 * A photo is stored as <family id>/<record id>/<file id>.jpg in the private "receipts" bucket.
 */

/** Longest side of a stored photo, in pixels: enough to read a receipt, small enough for the free storage plan. */
export const RECEIPT_MAX_EDGE = 1600;
export const RECEIPT_JPEG_QUALITY = 0.8;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

/** Sizes to scale a photo to: the longest side at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max = RECEIPT_MAX_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function receiptPath(householdId: string, recordId: string, fileId: string): string {
  return `${householdId}/${recordId}/${fileId}.jpg`;
}

/** True only for a path of the exact shape above for this family and record (no extra folders, no "..") . */
export function isReceiptPathFor(path: string, householdId: string, recordId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === householdId &&
    parts[1] === recordId &&
    /^[0-9a-f-]{36}\.jpg$/i.test(parts[2])
  );
}
