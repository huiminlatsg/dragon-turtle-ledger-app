import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { requireMembership } from "@/lib/session";
import type { ExpenseTemplate } from "@/lib/expense-templates";
import { loadFormData } from "../add/data";
import { AppHeader } from "../components/AppHeader";
import { saveTemplate } from "./actions";
export const dynamic = "force-dynamic";
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { lang, t } = await getT();
  const { supabase, membership } = await requireMembership();
  const [form, result, params] = await Promise.all([loadFormData(supabase, lang, t), supabase.from("expense_templates").select("id, merchant, account_id, category_id").order("merchant"), searchParams]);
  const templates = (result.data ?? []) as ExpenseTemplate[];
  const cats = form.categories.filter((c) => c.kind === "expense" && !form.categories.some((child) => child.parent_id === c.id));
  const catLabel = (id: string) => { const c = form.categories.find((c) => c.id === id); const parent = form.categories.find((p) => p.id === c?.parent_id); return [parent?.name, c?.name].filter(Boolean).join(" / "); };
  const fields = (template?: ExpenseTemplate) => <>
    <input type="hidden" name="id" value={template?.id ?? ""} />
    <label>{t("add.merchant")}<input name="merchant" required maxLength={100} defaultValue={template?.merchant} /></label>
    <label>{t("add.account")}<select name="account_id" required defaultValue={template?.account_id ?? ""}><option value="">{t("f.choose")}</option>{form.accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
    <label>{t("add.category")}<select name="category_id" defaultValue={template?.category_id ?? ""}><option value="">{t("tpl.noCategory")}</option>{cats.map((c) => <option key={c.id} value={c.id}>{catLabel(c.id)}</option>)}</select></label>
    <button name="op" value="save">{t("tpl.save")}</button>
    {template && <button name="op" value="delete" formNoValidate>{t("tpl.delete")}</button>}
  </>;
  return <main><AppHeader lang={lang} t={t} signedIn /><h1>{t("tpl.title")}</h1><p className="muted">{t("tpl.hint")}</p>
    {(params.error || result.error) && <p role="alert">{t("tpl.error")}</p>}{params.saved && <p role="status">{t("add.saved")}</p>}
    {membership.role !== "viewer" && <form action={saveTemplate} className="card"><h2>{t("tpl.new")}</h2>{fields()}</form>}
    {templates.map((template) => <section className="card" key={template.id}><h2>{template.merchant}</h2>{membership.role === "viewer" ? <p>{form.accounts.find((a) => a.id === template.account_id)?.label ?? t("tpl.unavailable")}</p> : <form action={saveTemplate}>{!form.accounts.some((a) => a.id === template.account_id) && <p role="alert">{t("tpl.unavailable")}</p>}{fields(template)}</form>}</section>)}
    <p><Link href="/add">{t("add.title")}</Link> · <Link href="/family">{membership.familyName}</Link></p>
  </main>;
}
