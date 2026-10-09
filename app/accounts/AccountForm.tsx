"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ACCOUNT_TYPES, NETWORKS, type AccountType } from "@/lib/accounts";
import { CARDS, PALETTE, findProvider, providersFor, tileFor } from "@/lib/banks";
import { AccountTile } from "../components/AccountTile";
import { saveAccount, type FormState } from "./actions";

export type AccountFormValues = {
  id?: string;
  type: AccountType;
  name: string;
  nickname: string;
  issuer: string;
  network: string;
  last4: string;
  color: string;
  currency: string;
  holder_user_id: string;
  statement_day: string;
  due_mode: "" | "day" | "after";
  due_value: string;
  credit_limit: string;
  annual_fee_month: string;
  funding_account_id: string;
  opening_balance: string;
  opening_balance_date: string;
};

type Props = {
  values: AccountFormValues;
  banks: { id: string; name: string }[];
  members: { user_id: string; display_name: string }[];
  months: string[]; // 12 month names
  text: Record<string, string>; // translated labels and error messages, keyed like lib/i18n
  cancelHref: string;
};

export function AccountForm({ values, banks, members, months, text, cancelHref }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccount, null);
  const [type, setType] = useState<AccountType>(values.type);
  const [dueMode, setDueMode] = useState(values.due_mode);
  const initialProvider = findProvider(values.issuer);
  const [pick, setPick] = useState(initialProvider ? initialProvider.id : values.issuer ? "other" : "");
  const [otherIssuer, setOtherIssuer] = useState(initialProvider ? "" : values.issuer);
  const [name, setName] = useState(values.name);
  const [nickname, setNickname] = useState(values.nickname);
  const [network, setNetwork] = useState(values.network);
  const [last4, setLast4] = useState(values.last4);
  const [color, setColor] = useState(values.color);
  const isCard = type === "credit_card";
  const hasCardNumber = type === "credit_card" || type === "debit_card";
  const hasBalance = type !== "debit_card";

  const offered = providersFor(type);
  const picked = offered.find((p) => p.id === pick) ?? (pick && pick !== "other" ? findProvider(pick) : null);
  const options = picked && !offered.includes(picked) ? [picked, ...offered] : offered;
  const issuer = pick === "other" ? otherIssuer.trim() : (picked?.name ?? "");
  const cards = isCard && picked ? (CARDS[picked.id] ?? []) : [];
  const preview = { type, issuer: issuer || null, color: color || null, name: nickname.trim() || name || text["f.name"], last4: hasCardNumber ? last4 : null, network: hasCardNumber ? network : null };
  const autoColor = tileFor({ ...preview, color: null }).bg;

  const chooseCard = (cardName: string) => {
    const card = cards.find((c) => c.name === cardName);
    if (!card) return;
    setName(card.name);
    if (card.network) setNetwork(card.network);
  };

  return (
    <form action={action} className="card">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <label htmlFor="type">{text["f.type"]}</label>
      <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
        {ACCOUNT_TYPES.map((t) => (
          <option key={t} value={t}>
            {text[`typeOne.${t}`]}
          </option>
        ))}
      </select>

      <AccountTile account={preview} size="large" />

      <label htmlFor="provider">{text["f.issuer"]}</label>
      <select id="provider" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="provider">
        <option value="">—</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="other">{text["f.issuerOther"]}</option>
      </select>
      {pick === "other" && (
        <input
          id="issuer_other"
          aria-label={text["f.issuerOtherName"]}
          value={otherIssuer}
          onChange={(e) => setOtherIssuer(e.target.value)}
          placeholder={text["f.issuerOtherName"]}
          maxLength={40}
        />
      )}
      <input type="hidden" name="issuer" value={issuer} />

      {cards.length > 0 && (
        <>
          <label htmlFor="card_product">{text["f.card"]}</label>
          <select id="card_product" value={cards.some((c) => c.name === name) ? name : ""} onChange={(e) => chooseCard(e.target.value)} data-testid="card-product">
            <option value="">{text["f.choose"]}</option>
            {cards.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="muted hint">{text["f.cardHint"]}</p>
        </>
      )}

      <label htmlFor="name">{text["f.officialName"]}</label>
      <input id="name" name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={text["f.namePlaceholder"]} />

      <label htmlFor="nickname">{text["f.nickname"]}</label>
      <input id="nickname" name="nickname" maxLength={40} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={text["f.nicknamePlaceholder"]} />
      <p className="muted hint">{text["f.nicknameHint"]}</p>

      <label id="color-label">{text["f.color"]}</label>
      <div className="swatches" role="radiogroup" aria-labelledby="color-label">
        <label className="swatch" style={{ background: autoColor, color: tileFor({ ...preview, color: null }).fg }} title={text["f.colorAuto"]}>
          <input type="radio" name="color" value="" checked={color === ""} onChange={() => setColor("")} aria-label={text["f.colorAuto"]} />
          A
        </label>
        {PALETTE.map((c) => (
          <label key={c} className="swatch" style={{ background: c }} title={c}>
            <input type="radio" name="color" value={c} checked={color.toUpperCase() === c} onChange={() => setColor(c)} aria-label={c} />
          </label>
        ))}
      </div>
      <p className="muted hint">{text["f.colorHint"]}</p>

      {hasCardNumber && (
        <div className="two-col">
          <div>
            <label htmlFor="network">{text["f.network"]}</label>
            <select id="network" name="network" value={network} onChange={(e) => setNetwork(e.target.value)}>
              <option value="">—</option>
              {NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n === "amex" ? "Amex" : n === "unionpay" ? "UnionPay" : n === "jcb" ? "JCB" : n === "other" ? "—" : n[0].toUpperCase() + n.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="last4">{text["f.last4"]}</label>
            <input id="last4" name="last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
          </div>
          <p className="muted hint full">{text["f.last4Hint"]}</p>
        </div>
      )}

      {type === "debit_card" &&
        (banks.length ? (
          <>
            <label htmlFor="funding">{text["f.funding"]}</label>
            <select id="funding" name="funding_account_id" defaultValue={values.funding_account_id} required>
              <option value="">{text["f.choose"]}</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="error">{text["f.fundingNone"]}</p>
        ))}

      {isCard && (
        <>
          <label htmlFor="statement_day">{text["f.statementDay"]}</label>
          <input id="statement_day" name="statement_day" inputMode="numeric" defaultValue={values.statement_day} />

          <label htmlFor="due_mode">{text["f.dueMode"]}</label>
          <select id="due_mode" name="due_mode" value={dueMode} onChange={(e) => setDueMode(e.target.value as AccountFormValues["due_mode"])}>
            <option value="">{text["f.dueNone"]}</option>
            <option value="day">{text["f.dueFixed"]}</option>
            <option value="after">{text["f.dueAfter"]}</option>
          </select>
          {dueMode && (
            <>
              <label htmlFor="due_value">{dueMode === "day" ? text["f.dueDay"] : text["f.dueDays"]}</label>
              <input id="due_value" name="due_value" inputMode="numeric" defaultValue={values.due_value} />
            </>
          )}

          <label htmlFor="credit_limit">{text["f.creditLimit"]}</label>
          <input id="credit_limit" name="credit_limit" inputMode="decimal" defaultValue={values.credit_limit} />

          <label htmlFor="annual_fee_month">{text["f.annualFeeMonth"]}</label>
          <select id="annual_fee_month" name="annual_fee_month" defaultValue={values.annual_fee_month}>
            <option value="">—</option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="two-col">
        <div>
          <label htmlFor="currency">{text["f.currency"]}</label>
          <input id="currency" name="currency" maxLength={3} autoCapitalize="characters" defaultValue={values.currency} />
        </div>
        <div>
          <label htmlFor="holder">{text["f.holder"]}</label>
          <select id="holder" name="holder_user_id" defaultValue={values.holder_user_id}>
            <option value="">{text["f.shared"]}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasBalance && (
        <div className="two-col">
          <div>
            <label htmlFor="opening_balance">{isCard ? text["f.openingOwed"] : text["f.openingBalance"]}</label>
            <input id="opening_balance" name="opening_balance" inputMode="decimal" defaultValue={values.opening_balance} />
          </div>
          <div>
            <label htmlFor="opening_balance_date">{text["f.openingDate"]}</label>
            <input id="opening_balance_date" name="opening_balance_date" type="date" defaultValue={values.opening_balance_date} />
          </div>
          <p className="muted hint full">{text["f.openingHint"]}</p>
        </div>
      )}

      {state && (
        <div className="error" role="alert">
          {state.errors.map((e) => (
            <p key={e}>{text[e] ?? e}</p>
          ))}
          {state.message && <p>{state.message}</p>}
        </div>
      )}

      <button type="submit" className="primary" disabled={pending}>
        {pending ? text["f.saving"] : text["f.save"]}
      </button>
      <Link href={cancelHref} className="secondary button-link">
        {text["f.cancel"]}
      </Link>
    </form>
  );
}
