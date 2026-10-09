"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ENTRY_KINDS, childCategories, defaultReceiptAccount, foreignCurrencyOptions, isPassThrough, paybackExceeds, parsePositiveAmount, splitCategory, topCategoriesFor, type CategoryOption, type EntryDefaults, type EntryInitial, type EntryKind } from "@/lib/expense";
import { matchExpenseTemplate, type ExpenseTemplate } from "@/lib/expense-templates";
import type { CardSuggestion } from "@/lib/card-defaults";
import { saveEntry, updateEntry, type AddState } from "./actions";

export type LedgerOption = { id: string; name: string; type: string; currency: string };
export type AccountOption = { id: string; label: string; type: string };
/** Spend waiting to be paid back, which a payback can be linked to. */
export type ClaimOption = { id: string; label: string; currency: string; remaining: number; group: "claim" | "spend" };

type Props = {
  ledgers: LedgerOption[];
  categories: CategoryOption[];
  accounts: AccountOption[];
  accountTypes: string[]; // order of the groups
  claims: ClaimOption[];
  initialKind: EntryKind;
  initialLedgerId: string;
  initialWhen: string; // "YYYY-MM-DDTHH:mm" in Singapore time
  savedToken: string; // changes after each saved entry, which clears the form
  text: Record<string, string>;
  /** "edit" opens an existing record: its kind is fixed and the fields start with its values. */
  mode?: "add" | "edit";
  recordId?: string;
  initial?: EntryInitial;
  /** What a new entry starts with, from the person's last entries (not used when editing). */
  defaults?: EntryDefaults;
  cardDefaults?: Record<string, CardSuggestion>;
  templates?: ExpenseTemplate[];
};

const fmt = (n: number, currency: string) => new Intl.NumberFormat("en-SG", { style: "currency", currency }).format(n);

/** Which field each error belongs to, so the form can mark it and show the reason beside it. */
const ERROR_FIELD: Record<string, string> = {
  "err.amount": "amount",
  "err.amountSgd": "amount_sgd",
  "err.category": "top_category",
  "err.categoryLedger": "top_category",
  "err.when": "txn_at",
  "err.foreignCurrency": "foreign_currency",
  "err.foreignAmount": "foreign_amount",
  "err.recoverable": "recoverable_amount",
  "err.textLong": "merchant_raw",
  "err.categoryProperty": "top_category",
  "err.fromAccount": "account_id",
  "err.toAccount": "to_account_id",
  "err.sameAccount": "to_account_id",
  "err.recoverablePaid": "recoverable_amount",
};

type AccountSelectProps = {
  id: string;
  label: string;
  accounts: AccountOption[];
  accountTypes: string[];
  text: Record<string, string>;
  className?: string;
  /** Text of the empty choice, which means cash. Without it (transfers) an account must be picked. */
  cashLabel?: string;
  /** Account chosen to start with (empty = none). */
  initial?: string;
  value?: string;
  onChange?: (value: string) => void;
};

function AccountSelect({ id, label, accounts, accountTypes, text, className, cashLabel, initial = "", value, onChange }: AccountSelectProps) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} className={className} defaultValue={value === undefined ? initial : undefined} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} required={!cashLabel}>
        <option value="">{cashLabel ?? text["f.choose"]}</option>
        {accountTypes.map((type) => {
          const group = accounts.filter((a) => a.type === type);
          return group.length ? (
            <optgroup key={type} label={text[`type.${type}`]}>
              {group.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
    </>
  );
}

export function EntryForm({ ledgers, categories, accounts, accountTypes, claims, initialKind, initialLedgerId, initialWhen, savedToken, text, mode = "add", recordId, initial, defaults, cardDefaults = {}, templates = [] }: Props) {
  const editing = mode === "edit" && initial !== undefined;
  const [state, action, pending] = useActionState<AddState, FormData>(editing ? updateEntry : saveEntry, null);
  const [kind, setKind] = useState<EntryKind>(initial?.kind ?? initialKind);
  const [ledgerId, setLedgerId] = useState(initial?.ledgerId ?? initialLedgerId);
  const startCategory = splitCategory(categories, initial?.categoryId ?? null);
  const [topId, setTopId] = useState(startCategory.topId);
  const [subId, setSubId] = useState(startCategory.subId);
  const [foreign, setForeign] = useState(initial?.foreign ?? false);
  const [recoverable, setRecoverable] = useState(initial?.recoverable ?? false);
  const [linked, setLinked] = useState<string[]>(initial?.linkedClaimIds ?? []);
  // A payback bigger than the expenses ticked: held here until the person confirms.
  const [warning, setWarning] = useState<{ amount: number; expected: number; data: FormData } | null>(null);
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [paidAccount, setPaidAccount] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Field id → reason, for the fields the last attempt was refused on.
  const fieldErrors: Record<string, string> = {};
  for (const e of state?.errors ?? []) {
    const id = ERROR_FIELD[e];
    if (id && !fieldErrors[id]) fieldErrors[id] = text[e] ?? e;
  }
  const otherErrors = (state?.errors ?? []).filter((e) => !ERROR_FIELD[e]);
  const bad = (id: string) => (fieldErrors[id] ? "invalid" : undefined);
  const reason = (id: string) =>
    fieldErrors[id] ? (
      <p className="field-error" role="alert" data-testid={`error-${id}`}>
        {fieldErrors[id]}
      </p>
    ) : null;

  // Take the person to the first refused field.
  useEffect(() => {
    const first = Object.keys(fieldErrors)[0];
    if (!first) return;
    const el = document.getElementById(first);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // After a saved entry the page reloads with a new token: start the next entry from a clean form.
  useEffect(() => {
    const form = formRef.current;
    if (!form || editing) return;
    form.reset();
    setPaidAccount(undefined);
    setMerchant("");
    const when = form.elements.namedItem("txn_at");
    if (when instanceof HTMLInputElement) when.value = initialWhen;
    setTopId("");
    setSubId("");
    setForeign(false);
    setRecoverable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedToken]);

  const ledger = ledgers.find((l) => l.id === ledgerId) ?? ledgers[0];
  // Transfers sit in the family's default ledger (listed first); they have no ledger or category choice.
  const money = kind === "transfer" && !editing ? ledgers[0] : ledger;
  const categoryKind = kind === "income" ? "income" : "expense";
  const tops = topCategoriesFor(categories, ledger.type, categoryKind);
  const subs = topId ? childCategories(categories, topId, ledger.type) : [];
  const categoryId = subs.length ? subId : topId;
  const category = categories.find((c) => c.id === categoryId);
  const suggestion = !editing && kind === "expense" ? cardDefaults[categoryId] : undefined;
  const template = !editing && kind === "expense" ? matchExpenseTemplate(templates, merchant, new Set(accounts.map((a) => a.id))) : undefined;
  const suggestedAccount = template?.account_id ?? suggestion?.accountId ?? defaults?.expenseAccount ?? "";
  const needsSgd = money.currency !== "SGD";
  const hasCategory = kind !== "transfer";

  const startOver = () => {
    setTopId("");
    setSubId("");
    setForeign(false);
    setRecoverable(false);
  };
  const chooseKind = (next: EntryKind) => {
    setKind(next);
    setPaidAccount(undefined);
    startOver(); // categories, paid-back and foreign fields belong to one kind
  };
  const chooseLedger = (id: string) => {
    setLedgerId(id);
    startOver(); // the categories on offer depend on the ledger type
  };

  return (
    <form
      ref={formRef}
      className="card"
      data-testid="entry-form"
      onSubmit={(e) => {
        // Not `action={...}`: React empties a form after a form action, and a refused entry must stay as typed.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (kind === "income" && category?.is_recovery) {
          const ticked = data.getAll("link_expense").map((id) => claims.find((c) => c.id === id)).filter((c) => c && c.currency === money.currency);
          const remaining = ticked.map((c) => c!.remaining);
          const amount = parsePositiveAmount(String(data.get("amount") ?? ""));
          if (amount !== null && paybackExceeds(amount, remaining)) {
            setWarning({ amount, expected: remaining.reduce((a, b) => a + b, 0), data });
            return;
          }
        }
        setWarning(null);
        startTransition(() => action(data));
      }}
    >
      {!editing && (
        <div className="seg" role="group" aria-label={text["add.title"]}>
          {ENTRY_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? "on" : undefined} onClick={() => chooseKind(k)} data-testid={`kind-${k}`}>
              {text[`add.kind.${k}`]}
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="kind" value={kind} />
      {editing && <input type="hidden" name="id" value={recordId ?? ""} />}

      {kind !== "transfer" && ledgers.length > 1 && (
        <>
          <label htmlFor="ledger_id">{text["add.ledger"]}</label>
          <select id="ledger_id" name="ledger_id" value={ledger.id} onChange={(e) => chooseLedger(e.target.value)}>
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.currency})
              </option>
            ))}
          </select>
        </>
      )}
      {(kind === "transfer" || ledgers.length === 1) && <input type="hidden" name="ledger_id" value={money.id} />}

      {!editing && kind === "expense" && templates.length > 0 && <>
        <label htmlFor="expense_template">{text["tpl.title"]}</label>
        <select id="expense_template" value={template?.id ?? ""} onChange={(e) => {
          const chosen = templates.find((t) => t.id === e.target.value);
          if (!chosen) { setMerchant(""); return; }
          setMerchant(chosen.merchant);
          setPaidAccount(undefined);
          const cat = categories.find((c) => c.id === chosen.category_id);
          if (cat && (cat.ledger_type === null || cat.ledger_type === ledger.type)) {
            const split = splitCategory(categories, cat.id); setTopId(split.topId); setSubId(split.subId);
            setRecoverable(isPassThrough(cat));
          }
        }}><option value="">{text["f.choose"]}</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.merchant}</option>)}</select>
      </>}
      <label htmlFor="amount">{text["add.amount"].replace("{currency}", money.currency)}</label>
      <input id="amount" name="amount" className={bad("amount")} inputMode="decimal" required autoComplete="off" placeholder="0.00" defaultValue={initial?.amount} />
      {reason("amount")}

      {needsSgd && (
        <>
          <label htmlFor="amount_sgd">{text["add.amountSgd"]}</label>
          <input id="amount_sgd" name="amount_sgd" className={bad("amount_sgd")} inputMode="decimal" required autoComplete="off" placeholder="0.00" defaultValue={initial?.amountSgd} />
          {reason("amount_sgd")}
          <p className="muted hint">{text["add.amountSgdHint"]}</p>
        </>
      )}

      {hasCategory && (
        <>
          <label htmlFor="top_category">{text["add.category"]}</label>
          <select
            id="top_category"
            className={bad("top_category")}
            value={topId}
            required
            onChange={(e) => {
              setTopId(e.target.value);
              setSubId("");
              // Spend on someone else's behalf (代付款) is normally paid back: start with that ticked.
              setRecoverable(kind === "expense" && isPassThrough(tops.find((c) => c.id === e.target.value)));
            }}
          >
            <option value="">{text["f.choose"]}</option>
            {tops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {subs.length > 0 && (
            <>
              <label htmlFor="sub_category">{text["add.sub"]}</label>
              <select id="sub_category" value={subId} required onChange={(e) => setSubId(e.target.value)}>
                <option value="">{text["f.choose"]}</option>
                {subs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {reason("top_category")}
          <input type="hidden" name="category_id" value={categoryId} />
        </>
      )}

      {kind === "expense" && (
        <AccountSelect id="account_id" label={text["add.account"]} cashLabel={text["add.cash"]} initial={initial?.accountId} value={editing ? undefined : paidAccount ?? suggestedAccount} onChange={editing ? undefined : setPaidAccount} className={bad("account_id")} {...{ accounts, accountTypes, text }} />
      )}
      {template && paidAccount === undefined && <p className="muted hint" data-testid="template-suggestion">{text["tpl.suggestion"]}</p>}
      {!template && suggestion && paidAccount === undefined && <p className="muted hint" data-testid="card-suggestion">{text[suggestion.reason === "last-used" ? "add.lastCategoryAccount" : "add.usageCard"].replace("{uses}", String(suggestion.uses)).replace("{total}", String(suggestion.total))}</p>}
      {kind === "income" && <AccountSelect id="account_id" label={text["add.receivedIn"]} cashLabel={text["add.cash"]} initial={initial ? initial.accountId : defaultReceiptAccount(accounts)} className={bad("account_id")} {...{ accounts, accountTypes, text }} />}
      {kind !== "transfer" && reason("account_id")}
      {kind === "transfer" && (
        <>
          <AccountSelect id="account_id" label={text["add.from"]} initial={initial ? initial.accountId : defaults?.transferFrom} key={`from-${initial ? "x" : defaults?.transferFrom}`} className={bad("account_id")} {...{ accounts, accountTypes, text }} />
          {reason("account_id")}
          <AccountSelect id="to_account_id" label={text["add.to"]} initial={initial ? initial.toAccountId : defaults?.transferTo} key={`to-${initial ? "x" : defaults?.transferTo}`} className={bad("to_account_id")} {...{ accounts, accountTypes, text }} />
          {reason("to_account_id")}
        </>
      )}

      {kind !== "transfer" && (
        <>
          <label htmlFor="merchant_raw">{kind === "income" ? text["add.source"] : text["add.merchant"]}</label>
          <input id="merchant_raw" name="merchant_raw" className={bad("merchant_raw")} maxLength={100} autoComplete="off" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          {reason("merchant_raw")}
        </>
      )}

      <label htmlFor="txn_at">{text["add.when"]}</label>
      <input id="txn_at" name="txn_at" className={bad("txn_at")} type="datetime-local" required defaultValue={initial?.when ?? initialWhen} />
      {reason("txn_at")}

      <label htmlFor="notes">{text["add.notes"]}</label>
      <input id="notes" name="notes" maxLength={500} autoComplete="off" defaultValue={initial?.notes} />

      {kind === "income" && category?.is_recovery && (
        <fieldset className="claims" data-testid="claims">
          <legend>{text["add.settles"]}</legend>
          {claims.filter((c) => c.group === "claim").length === 0 ? (
            <p className="muted hint">{text["add.noClaims"]}</p>
          ) : (
            claims
              .filter((c) => c.group === "claim")
              .map((c) => (
                <label key={c.id} className="check">
                  <input type="hidden" name="claims_listed" value={c.id} />
                  <input
                    type="checkbox"
                    name="link_expense"
                    value={c.id}
                    checked={linked.includes(c.id)}
                    onChange={(e) => setLinked((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
                  />
                  {c.label}
                </label>
              ))
          )}
          {claims.some((c) => c.group === "spend") && (
            <details className="spend-list" data-testid="spend-list" open={claims.some((c) => c.group === "spend" && initial?.linkedClaimIds.includes(c.id))}>
              <summary>{text["add.settlesSpend"]}</summary>
              {claims
                .filter((c) => c.group === "spend")
                .map((c) => (
                  <label key={c.id} className="check">
                  <input type="hidden" name="claims_listed" value={c.id} />
                  <input
                    type="checkbox"
                    name="link_expense"
                    value={c.id}
                    checked={linked.includes(c.id)}
                    onChange={(e) => setLinked((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
                  />
                  {c.label}
                </label>
                ))}
            </details>
          )}
          <p className="muted hint">{text["add.settlesHint"]}</p>
        </fieldset>
      )}

      {kind === "expense" && (
        <>
          <label className="check" htmlFor="is_recoverable">
            <input id="is_recoverable" name={initial?.hasPaybacks ? undefined : "is_recoverable"} type="checkbox" checked={recoverable} disabled={initial?.hasPaybacks} onChange={(e) => setRecoverable(e.target.checked)} />
            {text["add.recoverable"]}
          </label>
          {initial?.hasPaybacks && <input type="hidden" name="is_recoverable" value="on" />}
          {recoverable && (
            <div data-testid="recoverable-fields">
              <div className="two-col">
                <div>
                  <label htmlFor="recoverable_amount">{text["add.recoverableAmount"].replace("{currency}", ledger.currency)}</label>
                  <input id="recoverable_amount" name="recoverable_amount" className={bad("recoverable_amount")} inputMode="decimal" autoComplete="off" placeholder={text["add.recoverableAll"]} defaultValue={initial?.recoverableAmount} />
                </div>
                {!initial?.hasPaybacks && (
                  <div>
                    <label htmlFor="recovery_status">{text["add.status"]}</label>
                    <select id="recovery_status" name="recovery_status" defaultValue={initial?.status ?? "to_submit"}>
                      <option value="to_submit">{text["add.toSubmit"]}</option>
                      <option value="submitted">{text["add.submitted"]}</option>
                    </select>
                  </div>
                )}
              </div>
              {reason("recoverable_amount")}
              <p className="muted hint">{text["add.recoverableHint"]}</p>
            </div>
          )}

          <label className="check" htmlFor="is_foreign">
            <input id="is_foreign" name="is_foreign" type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} />
            {text["add.foreign"]}
          </label>
          {foreign && (
            <div data-testid="foreign-fields">
              <div className="two-col">
                <div>
                  <label htmlFor="foreign_currency">{text["add.foreignCurrency"]}</label>
                  <select id="foreign_currency" name="foreign_currency" className={bad("foreign_currency")} required defaultValue={initial?.foreignCurrency ?? ""}>
                    <option value="">{text["f.choose"]}</option>
                    {foreignCurrencyOptions(ledger.currency).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="foreign_amount">{text["add.foreignAmount"]}</label>
                  <input id="foreign_amount" name="foreign_amount" className={bad("foreign_amount")} inputMode="decimal" required autoComplete="off" defaultValue={initial?.foreignAmount} />
                </div>
              </div>
              {reason("foreign_currency")}
              {reason("foreign_amount")}
              <p className="muted hint">{text["add.foreignHint"]}</p>
            </div>
          )}
        </>
      )}

      {warning && (
        <div className="warning" role="alertdialog" aria-label={text["add.confirmTitle"]} data-testid="confirm-more">
          <p>
            <strong>{text["add.confirmTitle"]}</strong>
          </p>
          <p>{text["add.confirmBody"].replace("{amount}", fmt(warning.amount, money.currency)).replace("{expected}", fmt(warning.expected, money.currency))}</p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                const data = warning.data;
                setWarning(null);
                startTransition(() => action(data));
              }}
            >
              {text["add.confirmYes"]}
            </button>
            <button type="button" className="secondary" onClick={() => setWarning(null)}>
              {text["add.confirmNo"]}
            </button>
          </div>
        </div>
      )}

      {(otherErrors.length > 0 || state?.message) && (
        <div className="error" role="alert">
          {otherErrors.map((e) => (
            <p key={e}>{text[e] ?? e}</p>
          ))}
          {state?.message && <p>{state.message}</p>}
        </div>
      )}

      <button type="submit" className="primary" disabled={pending || Boolean(warning) || (hasCategory && !categoryId)}>
        {pending ? text["f.saving"] : editing ? text["f.save"] : text["add.submit"]}
      </button>
    </form>
  );
}
