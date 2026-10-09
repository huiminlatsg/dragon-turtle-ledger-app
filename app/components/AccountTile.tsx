import { tileFor } from "@/lib/banks";
import type { AccountType } from "@/lib/accounts";

type Props = {
  account: { type: AccountType; issuer: string | null; color?: string | null; name: string; last4?: string | null; network?: string | null };
  size?: "small" | "large";
};

const NETWORK_NAME: Record<string, string> = { visa: "VISA", mastercard: "Mastercard", amex: "AMEX", unionpay: "UnionPay", jcb: "JCB" };

/**
 * A coloured tile standing in for the card or account: bank name top left, network bottom right
 * (the network's name in plain text on a white pill, tinted in its usual colours; not its logo), last 4 digits bottom left on the large tile. No bank artwork.
 */
export function AccountTile({ account, size = "small" }: Props) {
  const { bg, fg, label } = tileFor(account);
  const large = size === "large";
  const network = account.network ? NETWORK_NAME[account.network] : undefined;
  return (
    <span className={`acct-tile ${size}`} style={{ background: bg, color: fg }} aria-hidden data-testid="account-tile">
      <span className="acct-tile-label">{label}</span>
      <span className="acct-tile-foot">
        <span>{large && account.last4 ? `•••• ${account.last4}` : ""}</span>
        {network && <span className={`acct-tile-network net-${account.network}`}>{account.network === "mastercard" ? <span>{network}</span> : network}</span>}
      </span>
    </span>
  );
}
