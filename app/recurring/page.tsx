import Link from "next/link";
import { nowSgtInput } from "@/lib/expense";
import { getT } from "@/lib/i18n-server";
import { pickMessages } from "@/lib/i18n";
import { requireMembership } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import type { RecurringVersion, RecurringOccurrence } from "@/lib/recurring";
import { AppHeader } from "../components/AppHeader";
import { loadFormData } from "../add/data";
import { RecurringForm, ConfirmOccurrence } from "./RecurringForm";
export const dynamic = "force-dynamic";
export default async function RecurringPage({ searchParams }: {searchParams:Promise<{saved?:string}>}) {
  const {lang,t}=await getT(); const {supabase,membership}=await requireMembership();
  const [form,versionsResult,planResult,params]=await Promise.all([loadFormData(supabase,lang,t),supabase.from("recurring_versions").select("*").order("revision",{ascending:false}),supabase.rpc("recurring_plan"),searchParams]);
  const versions=(versionsResult.data??[]) as RecurringVersion[];
  const latest=[...new Map([...versions].reverse().map((v)=>[v.series_id,v])).values()];
  const plan=(planResult.data??[]) as RecurringOccurrence[];
  const today=nowSgtInput().slice(0,10); const due=plan.filter((o)=>o.state==="planned"&&o.due_date<=today); const upcoming=plan.filter((o)=>o.state==="planned"&&o.due_date>today); const recorded=plan.filter((o)=>o.state!=="planned");
  const text=pickMessages(lang,["repeat.","add.","f.","err."]); const canWrite=membership.role!=="viewer";
  const occurrence=(o:RecurringOccurrence,confirm:boolean)=><li key={o.series_id+o.due_date}><strong>{o.name}</strong><p className="muted small">{o.due_date} · {formatMoney(Number(o.amount),o.currency.trim())} · {form.accounts.find((a)=>a.id===o.account_id)?.label ?? (o.account_id ? t("repeat.inactive") : t("add.cash"))}</p>{o.merchant&&<p>{o.merchant}</p>}{o.notes&&<p>{o.notes}</p>}{confirm&&canWrite&&<ConfirmOccurrence occurrence={o} text={text}/>}</li>;
  return <main><AppHeader lang={lang} t={t} signedIn/><h1>{t("repeat.title")}</h1><p className="muted">{t("repeat.hint")}</p>
    {params.saved&&<p role="status">{t("add.saved")}</p>}{(versionsResult.error||planResult.error)&&<p role="alert">{t("repeat.loadError")}</p>}
    <h2>{t("repeat.due")}</h2>{due.length ? <ul className="list card" data-testid="recurring-due">{due.map((o)=>occurrence(o,true))}</ul> : <p>{t("repeat.noneDue")}</p>}
    <details><summary>{t("repeat.upcoming")} ({upcoming.length})</summary><ul className="list card">{upcoming.map((o)=>occurrence(o,false))}</ul></details>
    <details><summary>{t("repeat.recorded")}</summary><ul className="list card">{recorded.map((o)=><li key={o.series_id+o.due_date}>{o.name} · {o.due_date} · {t(o.state==="skipped"?"repeat.skipped":"repeat.confirmed")} {o.transaction_id&&<Link href={`/records/${o.transaction_id}`}>{t("repeat.viewRecord")}</Link>}</li>)}</ul></details>
    {canWrite&&<details><summary>{t("repeat.new")}</summary><RecurringForm {...form} text={text}/></details>}
    <h2>{t("repeat.schedules")}</h2>{latest.map((v)=><details key={v.series_id} className="card"><summary>{v.name} · {t(v.frequency==="yearly"?"repeat.yearly":"repeat.monthly")}</summary><p className="muted">{t("repeat.versionFrom",{date:v.effective_from})}{!v.enabled&&` · ${t("repeat.stopped")}`}</p>{canWrite&&<RecurringForm {...form} version={v} text={text}/>}<details><summary>{t("repeat.history")}</summary><ul>{versions.filter((row)=>row.series_id===v.series_id).map((row)=><li key={row.id}>{row.effective_from} · {row.name} · {row.amount} · {row.start_date} · {row.end_date ?? t("repeat.noEnd")} · {row.notes}</li>)}</ul></details></details>)}
    <p><Link href="/add">{t("add.title")}</Link> · <Link href="/family">{membership.familyName}</Link></p>
  </main>;
}
