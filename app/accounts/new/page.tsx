import { ACCOUNT_TYPES, type AccountType } from "@/lib/accounts";
import { getT } from "@/lib/i18n-server";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../../components/AppHeader";
import { AccountForm } from "../AccountForm";
import { emptyValues, formContext } from "../form-data";

export const dynamic = "force-dynamic";

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { lang, t } = await getT();
  const { supabase, membership } = await requireMembership();
  const requested = (await searchParams).type ?? "";
  const type: AccountType = (ACCOUNT_TYPES as readonly string[]).includes(requested) ? (requested as AccountType) : "credit_card";
  const ctx = await formContext(supabase, membership.householdId, lang);

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{t("acc.new")}</h1>
      <AccountForm values={emptyValues(type)} cancelHref="/accounts" {...ctx} />
    </main>
  );
}
