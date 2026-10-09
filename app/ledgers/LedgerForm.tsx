"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { COMMON_CURRENCIES, CREATABLE_LEDGER_TYPES, type LedgerType } from "@/lib/ledgers";
import { saveLedger, type LedgerFormState } from "./actions";

export type LedgerFormValues = {
  id?: string;
  name: string;
  type: LedgerType;
  currency: string;
  start_date: string;
  end_date: string;
};

type Props = {
  values: LedgerFormValues;
  text: Record<string, string>; // translated labels and messages, keyed like lib/i18n
  cancelHref: string;
  /** Editing: the type is fixed. */
  typeFixed?: boolean;
  /** Editing a ledger that already has records: the currency is fixed. */
  currencyLocked?: boolean;
};

export function LedgerForm({ values, text, cancelHref, typeFixed, currencyLocked }: Props) {
  const [state, action, pending] = useActionState<LedgerFormState, FormData>(saveLedger, null);
  // The type picker only shows when creating, so it never has to represent "daily".
  const [type, setType] = useState<LedgerType>(values.type);
  const showDates = type === "trip";

  return (
    <form action={action} className="card" data-testid="ledger-form">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <label htmlFor="name">{text["led.name"]}</label>
      <input id="name" name="name" required maxLength={60} defaultValue={values.name} />

      {typeFixed ? (
        <>
          <label>{text["led.type"]}</label>
          <p style={{ margin: 0 }}>{text[`led.type.${values.type}`]}</p>
          <p className="muted hint">{text["led.typeFixed"]}</p>
        </>
      ) : (
        <>
          <label htmlFor="type">{text["led.type"]}</label>
          <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as LedgerType)}>
            {CREATABLE_LEDGER_TYPES.map((t) => (
              <option key={t} value={t}>
                {text[`led.type.${t}`]}
              </option>
            ))}
          </select>
          <p className="muted hint">{text[`led.typeHint.${type}`]}</p>
        </>
      )}

      <label htmlFor="currency">{text["led.currency"]}</label>
      {currencyLocked ? (
        <>
          <p style={{ margin: 0 }}>{values.currency}</p>
          <input type="hidden" name="currency" value={values.currency} />
          <p className="muted hint">{text["led.currencyLocked"]}</p>
        </>
      ) : (
        <>
          <input
            id="currency"
            name="currency"
            list="currency-options"
            maxLength={3}
            defaultValue={values.currency}
            autoCapitalize="characters"
            style={{ textTransform: "uppercase" }}
          />
          <datalist id="currency-options">
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="muted hint">{text["led.currencyHint"]}</p>
        </>
      )}

      {showDates && (
        <div className="two-col">
          <div>
            <label htmlFor="start_date">{text["led.start"]}</label>
            <input id="start_date" name="start_date" type="date" defaultValue={values.start_date} />
          </div>
          <div>
            <label htmlFor="end_date">{text["led.end"]}</label>
            <input id="end_date" name="end_date" type="date" defaultValue={values.end_date} />
          </div>
        </div>
      )}

      {state && (
        <div className="error" role="alert">
          {state.errors.map((e) => (
            <p key={e}>{text[e] ?? e}</p>
          ))}
          {state.message && <p>{state.message}</p>}
        </div>
      )}

      <button type="submit" className="primary" disabled={pending}>
        {pending ? text["f.saving"] : text["f.save"]}
      </button>
      <Link href={cancelHref} className="secondary button-link">
        {text["f.cancel"]}
      </Link>
    </form>
  );
}
