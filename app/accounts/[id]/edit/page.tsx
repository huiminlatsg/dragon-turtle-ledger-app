import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../../../components/AppHeader";
import { AccountForm } from "../../AccountForm";
import { formContext, valuesFromRow } from "../../form-data";

export const dynamic = "force-dynamic";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { lang, t } = await getT();
  const { supabase, membership } = await requireMembership();
  const { id } = await params;
  const { data: account } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (!account) notFound();
  const ctx = await formContext(supabase, membership.householdId, lang, id);

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("acc.editTitle")}</h1>
      <AccountForm values={valuesFromRow(account)} cancelHref={`/accounts/${id}`} {...ctx} />
    </main>
  );
}
