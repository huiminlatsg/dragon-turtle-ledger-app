import { getT } from "@/lib/i18n-server";
import { FinishGoogleSignIn } from "./FinishGoogleSignIn";

export const dynamic = "force-dynamic";

/** Google sends the person back here with a signed ID token after they choose their account. */
export default async function GoogleReturnPage() {
  const { t } = await getT();
  return (
    <main>
      <p className="muted" role="status">
        {t("login.signingIn")}
      </p>
      <FinishGoogleSignIn />
    </main>
  );
}
