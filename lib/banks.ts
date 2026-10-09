/**
 * Singapore banks, wallets and card products for the account picker, and the colour tile each
 * account shows. Names only: no bank logos or card artwork are stored or shown (they belong to
 * the banks). Colours are our own approximations so accounts are easy to tell apart, and every
 * account can pick a different one.
 *
 * Card lists checked October 2026 against the banks' and comparison sites' listings. Cards come and
 * go, so "Other" is always available and the name stays editable.
 */
import type { AccountType } from "@/lib/accounts";

export type Network = "visa" | "mastercard" | "amex" | "unionpay" | "jcb" | "other";

export interface Provider {
  id: string;
  name: string;
  /** Up to 5 characters, shown on the tile. */
  short: string;
  color: string;
  /** Which account types this provider is offered for. */
  for: readonly AccountType[];
}

const CARD_AND_BANK = ["credit_card", "debit_card", "bank"] as const;

export const PROVIDERS: readonly Provider[] = [
  { id: "dbs", name: "DBS", short: "DBS", color: "#C8102E", for: CARD_AND_BANK },
  { id: "posb", name: "POSB", short: "POSB", color: "#1D4F91", for: CARD_AND_BANK },
  { id: "ocbc", name: "OCBC", short: "OCBC", color: "#D52B1E", for: CARD_AND_BANK },
  { id: "uob", name: "UOB", short: "UOB", color: "#0B3C8C", for: CARD_AND_BANK },
  { id: "sc", name: "Standard Chartered", short: "SC", color: "#0F7B53", for: CARD_AND_BANK },
  { id: "citi", name: "Citi", short: "Citi", color: "#0A6EBD", for: CARD_AND_BANK },
  { id: "hsbc", name: "HSBC", short: "HSBC", color: "#A8000F", for: CARD_AND_BANK },
  { id: "maybank", name: "Maybank", short: "MBB", color: "#E8B400", for: CARD_AND_BANK },
  { id: "amex", name: "American Express", short: "AMEX", color: "#2B6CB0", for: ["credit_card"] },
  { id: "trust", name: "Trust Bank", short: "Trust", color: "#23285A", for: CARD_AND_BANK },
  { id: "gxs", name: "GXS Bank", short: "GXS", color: "#5B2BC2", for: CARD_AND_BANK },
  { id: "maribank", name: "MariBank", short: "Mari", color: "#E8641B", for: ["bank", "debit_card"] },
  { id: "grabpay", name: "GrabPay", short: "Grab", color: "#00A651", for: ["stored_value"] },
  { id: "shopeepay", name: "ShopeePay", short: "Shpee", color: "#E2492C", for: ["stored_value"] },
  { id: "ezlink", name: "EZ-Link", short: "EZ", color: "#5E9E2F", for: ["stored_value"] },
  { id: "youtrip", name: "YouTrip", short: "YT", color: "#3A2DA8", for: ["stored_value"] },
  { id: "revolut", name: "Revolut", short: "Rev", color: "#24272B", for: ["stored_value", "debit_card"] },
  { id: "wise", name: "Wise", short: "Wise", color: "#2F6B1F", for: ["stored_value", "debit_card"] },
];

export interface CardProduct {
  name: string;
  /** Null when the card comes on more than one network or we aren't sure; the person picks. */
  network: Network | null;
}

export const CARDS: Readonly<Record<string, readonly CardProduct[]>> = {
  dbs: [
    { name: "DBS Altitude Visa Signature", network: "visa" },
    { name: "DBS Altitude American Express", network: "amex" },
    { name: "DBS Vantage Visa Infinite", network: "visa" },
    { name: "DBS Live Fresh", network: "visa" },
    { name: "DBS Woman's World Card", network: "mastercard" },
    { name: "DBS Woman's Card", network: "mastercard" },
    { name: "DBS yuu Visa", network: "visa" },
    { name: "DBS yuu American Express", network: "amex" },
    { name: "DBS Takashimaya American Express", network: "amex" },
    { name: "DBS Chromo", network: null },
    { name: "DBS Esso Card", network: null },
    { name: "SAFRA DBS Card", network: null },
    { name: "POSB Everyday Card", network: null },
  ],
  uob: [
    { name: "UOB One", network: null },
    { name: "UOB Absolute Cashback", network: "amex" },
    { name: "UOB EVOL", network: "visa" },
    { name: "UOB PRVI Miles Visa", network: "visa" },
    { name: "UOB PRVI Miles Mastercard", network: "mastercard" },
    { name: "UOB PRVI Miles American Express", network: "amex" },
    { name: "UOB Lady's Card", network: "mastercard" },
    { name: "UOB Lady's Solitaire", network: "mastercard" },
    { name: "UOB Visa Infinite Metal", network: "visa" },
    { name: "KrisFlyer UOB", network: null },
    { name: "Lazada-UOB Card", network: null },
    { name: "Singtel-UOB Card", network: null },
    { name: "UOB Preferred Platinum Visa", network: "visa" },
  ],
  citi: [
    { name: "Citi Rewards", network: null },
    { name: "Citi PremierMiles", network: null },
    { name: "Citi Prestige", network: "mastercard" },
    { name: "Citi Cash Back", network: "mastercard" },
    { name: "Citi Cash Back+", network: "mastercard" },
    { name: "Citi SMRT", network: "visa" },
    { name: "Citi M1", network: null },
  ],
  sc: [
    { name: "SC Visa Infinite", network: "visa" },
    { name: "SC Journey", network: "visa" },
    { name: "SC Simply Cash", network: "visa" },
    { name: "SC Smart", network: "visa" },
    { name: "SC Rewards+", network: "visa" },
    { name: "SC Beyond", network: "visa" },
  ],
};

/** Extra colours anyone can pick for an account (e.g. to tell two cards from one bank apart). */
export const PALETTE = [
  "#C8102E", "#E8641B", "#E8B400", "#5E9E2F", "#0F7B53", "#0A8F9E",
  "#0A6EBD", "#0B3C8C", "#5B2BC2", "#B5317A", "#6B4F3A", "#24272B",
] as const;

const TYPE_COLORS: Record<AccountType, string> = {
  credit_card: "#4B5563",
  debit_card: "#4B5563",
  bank: "#3F5A52",
  stored_value: "#5B5F7A",
  cash: "#6B7B3A",
};

export const providersFor = (type: AccountType) => PROVIDERS.filter((p) => p.for.includes(type));

/** The provider whose name or short name matches what is stored in accounts.issuer (case-insensitive). */
export function findProvider(issuer: string | null | undefined): Provider | null {
  const s = (issuer ?? "").trim().toLowerCase();
  if (!s) return null;
  return PROVIDERS.find((p) => p.name.toLowerCase() === s || p.short.toLowerCase() === s || p.id === s) ?? null;
}

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Black or white text, whichever reads better on `bg`. */
export function textOn(bg: string): "#000000" | "#FFFFFF" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(bg.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#000000" : "#FFFFFF";
}

/** What an account's tile shows: its own colour, else its bank's, else one for its type. */
export function tileFor(a: { type: AccountType; issuer: string | null; color?: string | null; name: string }) {
  const p = findProvider(a.issuer);
  const bg = isHexColor(a.color) ? a.color.toUpperCase() : (p?.color ?? TYPE_COLORS[a.type]);
  const label = p?.short ?? (a.issuer?.trim() || a.name).slice(0, 4);
  return { bg, fg: textOn(bg), label };
}
