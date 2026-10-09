import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { requireMembership } from "@/lib/session";
import { AppHeader } from "../components/AppHeader";
import { InviteLink } from "./InviteLink";

export const dynamic = "force-dynamic";

type MemberRow = { user_id: string; display_name: string; role: "owner" | "member" | "viewer" };
type OverviewRow = {
  family_name: string;
  member_count: number;
  transactions: number;
  last_activity: string | null;
};

export default async function FamilyPage() {
  const { lang, t } = await getT();
  const { supabase, userId, membership } = await requireMembership();

  const { data: members } = await supabase
    .from("members")
    .select("user_id, display_name, role")
    .eq("household_id", membership.householdId)
    .order("created_at");

  const { data: isAdmin } = await supabase.rpc("is_app_admin");
  const overview = isAdmin ? ((await supabase.rpc("admin_overview")).data as OverviewRow[] | null) : null;
  const dateFmt = new Intl.DateTimeFormat(lang === "zh" ? "zh-SG" : "en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" });

  const linkText = {
    create: t("family.createLink"),
    creating: t("family.creating"),
    share: t("family.share"),
    copy: t("family.copy"),
    copied: t("family.copied"),
    note: t("family.note"),
    generic: t("error.generic"),
  };

  return (
    <main>
      <AppHeader lang={lang} t={t} signedIn />
      <h1>{membership.familyName}</h1>

      <section className="card" aria-label={t("family.members")}>
        <h2>{t("family.members")}</h2>
        <ul className="list" data-testid="members">
          {((members ?? []) as MemberRow[]).map((m) => (
            <li key={m.user_id} className="row">
              <span>
                {m.display_name}
                {m.user_id === userId && <span className="muted"> ({t("family.you")})</span>}
              </span>
              <span className="muted">{t(`role.${m.role}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-label={t("family.books")}>
        <h2>{t("family.books")}</h2>
        <ul className="list">
          <li><Link href="/recurring" className="row"><span>{t("repeat.title")}</span><span>→</span></Link></li>
          <li><Link href="/templates" className="row"><span>{t("tpl.title")}</span><span>→</span></Link></li>
          <li>
            <Link href="/accounts" className="row" data-testid="family-accounts">
              <span>
                <span className="account-name">{t("nav.accounts")}</span>
                <span className="muted small block">{t("family.accountsDesc")}</span>
              </span>
              <span className="muted">→</span>
            </Link>
          </li>
          <li>
            <Link href="/ledgers" className="row" data-testid="family-ledgers">
              <span>
                <span className="account-name">{t("nav.ledgers")}</span>
                <span className="muted small block">{t("family.ledgersDesc")}</span>
              </span>
              <span className="muted">→</span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>{t("family.invite")}</h2>
        <p className="muted hint">{t("family.inviteHint")}</p>
        <InviteLink kind="member" text={linkText} />
      </section>

      {isAdmin && (
        <>
          <h2 className="section-title">{t("family.admin")}</h2>
          <section className="card">
            <h2>{t("family.newFamily")}</h2>
            <p className="muted hint">{t("family.newFamilyHint")}</p>
            <InviteLink kind="family" text={linkText} />
          </section>
          <section className="card">
            <h2>{t("family.overview")}</h2>
            <p className="muted hint">{t("family.overviewHint")}</p>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("family.colFamily")}</th>
                  <th>{t("family.colMembers")}</th>
                  <th>{t("family.colTransactions")}</th>
                  <th>{t("family.colLast")}</th>
                </tr>
              </thead>
              <tbody>
                {(overview ?? []).map((f) => (
                  <tr key={f.family_name}>
                    <td>{f.family_name}</td>
                    <td>{f.member_count}</td>
                    <td>{f.transactions}</td>
                    <td>{f.last_activity ? dateFmt.format(new Date(f.last_activity)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
