import { describe, expect, it } from "vitest";
import { CARDS, PALETTE, PROVIDERS, findProvider, isHexColor, providersFor, textOn, tileFor } from "@/lib/banks";
import { parseAccountForm } from "@/lib/accounts";

describe("banks and cards list", () => {
  it("has unique ids and valid colours, and cards only for listed banks", () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    for (const p of PROVIDERS) expect(isHexColor(p.color)).toBe(true);
    for (const c of PALETTE) expect(isHexColor(c)).toBe(true);
    for (const id of Object.keys(CARDS)) expect(findProvider(id)).not.toBeNull();
    for (const id of ["dbs", "uob", "citi", "sc"]) expect(CARDS[id].length).toBeGreaterThan(3);
  });

  it("offers banks for cards and wallets for stored value", () => {
    expect(providersFor("credit_card").map((p) => p.id)).toContain("citi");
    expect(providersFor("credit_card").map((p) => p.id)).not.toContain("grabpay");
    expect(providersFor("stored_value").map((p) => p.id)).toContain("grabpay");
  });

  it("matches what is stored in issuer, ignoring case", () => {
    expect(findProvider("Standard Chartered")?.id).toBe("sc");
    expect(findProvider(" citi ")?.id).toBe("citi");
    expect(findProvider("Some Credit Union")).toBeNull();
    expect(findProvider(null)).toBeNull();
  });
});

describe("tileFor", () => {
  it("uses the account's colour, else the bank's, else one for the type", () => {
    expect(tileFor({ type: "credit_card", issuer: "DBS", color: "#0a8f9e", name: "x" })).toMatchObject({ bg: "#0A8F9E", label: "DBS" });
    expect(tileFor({ type: "credit_card", issuer: "DBS", color: null, name: "x" }).bg).toBe(findProvider("dbs")!.color);
    expect(tileFor({ type: "cash", issuer: null, color: "nonsense", name: "Wallet" })).toMatchObject({ bg: "#6B7B3A", label: "Wall" });
  });

  it("picks readable text", () => {
    expect(textOn("#E8B400")).toBe("#000000");
    expect(textOn("#0B3C8C")).toBe("#FFFFFF");
  });
});

describe("account colour", () => {
  it("keeps a valid colour and drops anything else", () => {
    const ok = parseAccountForm({ type: "bank", name: "DBS Multiplier", color: "#0a6ebd" });
    expect(ok.ok && ok.row.color).toBe("#0A6EBD");
    const bad = parseAccountForm({ type: "bank", name: "DBS Multiplier", color: "red; x" });
    expect(bad.ok && bad.row.color).toBeNull();
  });
});
