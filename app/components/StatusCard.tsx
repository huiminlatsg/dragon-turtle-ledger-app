import { env } from "@/lib/env";
import { databaseStatus } from "@/lib/health";
import type { Translate } from "@/lib/i18n";

const TONE = { ok: "ok", not_configured: "warn", unreachable: "bad" } as const;

/** Version, environment and database health (also used by the deployment checks). */
export async function StatusCard({ t }: { t: Translate }) {
  const db = await databaseStatus();
  return (
    <section className="card" aria-label={t("status.title")}>
      <div className="row">
        <span>{t("status.version")}</span>
        <span data-testid="version">{env.version}</span>
      </div>
      <div className="row">
        <span>{t("status.environment")}</span>
        <span data-testid="environment">{env.appEnv}</span>
      </div>
      <div className="row">
        <span>{t("status.database")}</span>
        <span className={`badge ${TONE[db]}`} data-testid="database">
          {t(`status.${db}`)}
        </span>
      </div>
    </section>
  );
}
