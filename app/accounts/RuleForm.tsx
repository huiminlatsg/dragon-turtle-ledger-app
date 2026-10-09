"use client";

import { useActionState } from "react";
import { addRule, type FormState } from "./actions";

/** Adds a min-spend or bonus-cap rule to a card. */
export function RuleForm({ accountId, text }: { accountId: string; text: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addRule, null);
  return (
    <form action={action} className="rule-form">
      <input type="hidden" name="account_id" value={accountId} />
      <div className="two-col">
        <div>
          <label htmlFor="kind">{text["rule.kind"]}</label>
          <select id="kind" name="kind" defaultValue="min_spend">
            <option value="min_spend">{text["rule.min_spend"]}</option>
            <option value="bonus_cap">{text["rule.bonus_cap"]}</option>
          </select>
        </div>
        <div>
          <label htmlFor="amount">{text["rule.amount"]}</label>
          <input id="amount" name="amount" inputMode="decimal" required />
        </div>
      </div>
      <label htmlFor="period">{text["rule.period"]}</label>
      <select id="period" name="period" defaultValue="calendar_month">
        <option value="calendar_month">{text["rule.calendar_month"]}</option>
        <option value="statement_cycle">{text["rule.statement_cycle"]}</option>
      </select>
      <div className="two-col">
        <div>
          <label htmlFor="valid_from">{text["rule.from"]}</label>
          <input id="valid_from" name="valid_from" type="date" />
        </div>
        <div>
          <label htmlFor="valid_to">{text["rule.to"]}</label>
          <input id="valid_to" name="valid_to" type="date" />
        </div>
      </div>
      <label htmlFor="note">{text["rule.note"]}</label>
      <input id="note" name="note" maxLength={120} />
      {state && (
        <div className="error" role="alert">
          {state.errors.map((e) => (
            <p key={e}>{text[e] ?? e}</p>
          ))}
          {state.message && <p>{state.message}</p>}
        </div>
      )}
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? text["f.saving"] : `+ ${text["rule.add"]}`}
      </button>
    </form>
  );
}
