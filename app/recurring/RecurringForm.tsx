"use client";
import { startTransition, useActionState, useState } from "react";
import { topCategoriesFor, childCategories, nowSgtInput, type CategoryOption } from "@/lib/expense";
import { tomorrowSgt, type RecurringVersion, type RecurringOccurrence } from "@/lib/recurring";
import type { LedgerOption, AccountOption } from "../add/EntryForm";
import { saveRecurring, confirmRecurring, type RepeatState } from "./actions";
type Props = { version?: RecurringVersion; ledgers: LedgerOption[]; categories: CategoryOption[]; accounts: AccountOption[]; text: Record<string,string> };
export function RecurringForm({ version, ledgers, categories, accounts, text }: Props) {
  const [state, action, pending] = useActionState<RepeatState, FormData>(saveRecurring, null);
  const [ledgerId, setLedgerId] = useState(version?.ledger_id ?? ledgers[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(version?.category_id ?? "");
  const [noEnd, setNoEnd] = useState(!version?.end_date);
  const ledger = ledgers.find((l) => l.id === ledgerId);
  const cats = topCategoriesFor(categories, ledger?.type ?? "daily", "expense").flatMap((p) => { const children = childCategories(categories,p.id,ledger?.type ?? "daily"); return children.length ? children.map((c) => ({...c,label:p.name+" / "+c.name})) : [{...p,label:p.name}]; });
  return <form className="card" onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)); }} data-testid="recurring-form">
    <input type="hidden" name="series_id" value={version?.series_id ?? ""}/><input type="hidden" name="expected" value={version?.id ?? ""}/>
    <label>{text["repeat.name"]}<input name="name" required maxLength={100} defaultValue={version?.name}/></label>
    <label>{text["add.ledger"]}<select name="ledger_id" value={ledgerId} required onChange={(e)=>{setLedgerId(e.target.value);setCategoryId("");}}><option value="">{text["f.choose"]}</option>{ledgers.map((l)=><option key={l.id} value={l.id}>{l.name} ({l.currency})</option>)}</select></label>
    <label>{text["add.category"]}<select name="category_id" required value={categoryId} onChange={(e)=>setCategoryId(e.target.value)}><option value="">{text["f.choose"]}</option>{cats.map((c)=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label>{text["add.account"]}<select name="account_id" defaultValue={version?.account_id ?? ""}><option value="">{text["add.cash"]}</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
    <label>{text["add.amount"].replace("{currency}",ledger?.currency ?? "SGD")}<input name="amount" required inputMode="decimal" defaultValue={version?.amount}/></label>
    {ledger?.currency !== "SGD" && <label>{text["add.amountSgd"]}<input name="amount_sgd" required inputMode="decimal" defaultValue={version?.amount_sgd}/></label>}
    <label>{text["repeat.frequency"]}<select name="frequency" defaultValue={version?.frequency ?? "monthly"}><option value="monthly">{text["repeat.monthly"]}</option><option value="yearly">{text["repeat.yearly"]}</option></select></label>
    <label>{text["repeat.start"]}<input name="start_date" type="date" required min="1900-01-01" max="2200-12-31" defaultValue={version?.start_date ?? nowSgtInput().slice(0,10)}/></label>
    <label className="check"><input type="checkbox" checked={noEnd} onChange={(e)=>setNoEnd(e.target.checked)}/>{text["repeat.noEnd"]}</label>
    {!noEnd && <label>{text["repeat.end"]}<input name="end_date" type="date" required defaultValue={version?.end_date ?? ""}/></label>}
    <label>{text["add.merchant"]}<input name="merchant" maxLength={100} defaultValue={version?.merchant ?? ""}/></label>
    <label>{text["add.notes"]}<input name="notes" maxLength={500} defaultValue={version?.notes ?? ""}/></label>
    <label className="check"><input type="checkbox" name="enabled" defaultChecked={version?.enabled ?? true}/>{text["repeat.enabled"]}</label>
    {version && <><label>{text["repeat.effective"]}<input name="effective_from" type="date" required min={tomorrowSgt()} defaultValue={version.effective_from > tomorrowSgt() ? version.effective_from : tomorrowSgt()}/></label><p className="muted hint">{text["repeat.futureHint"]}</p></>}
    <p className="muted hint">{text["repeat.anchorHint"]}</p>
    {state?.errors.map((k)=><p key={k} role="alert">{text[k] ?? text["repeat.saveError"]}</p>)}
    <button disabled={pending}>{pending ? text["repeat.saving"] : text["repeat.save"]}</button>
  </form>;
}
export function ConfirmOccurrence({ occurrence: o, text }: { occurrence: RecurringOccurrence; text: Record<string,string> }) {
  const [state, action, pending] = useActionState<RepeatState,FormData>(confirmRecurring,null);
  return <form onSubmit={(e)=>{e.preventDefault(); const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; const data=new FormData(e.currentTarget,submitter); startTransition(()=>action(data));}}>
    <input type="hidden" name="version" value={o.id}/><input type="hidden" name="due" value={o.due_date}/><input type="hidden" name="currency" value={o.currency}/>
    <label>{text["repeat.actual"]} ({o.currency})<input name="amount" required inputMode="decimal" defaultValue={o.amount}/></label>
    {o.currency.trim()!=="SGD" && <label>{text["add.amountSgd"]}<input name="amount_sgd" required inputMode="decimal" defaultValue={o.amount_sgd}/></label>}
    <label>{text["add.notes"]}<input name="notes" maxLength={500} defaultValue={o.notes ?? ""}/></label>
    {state?.errors.map((k)=><p key={k} role="alert">{text[k]}</p>)}
    <button name="op" value="confirm" disabled={pending}>{text["repeat.confirm"]}</button><button name="op" value="skip" formNoValidate disabled={pending}>{text["repeat.skip"]}</button>
  </form>;
}
