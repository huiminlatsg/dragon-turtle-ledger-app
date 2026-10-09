"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Text = Record<
  | "familyName" | "familyNamePlaceholder" | "yourName" | "yourNamePlaceholder" | "familyInvite"
  | "create" | "creating" | "needInvite" | "generic",
  string
>;

export function CreateFamilyForm({ familyInvite, text }: { familyInvite: string; text: Text }) {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [yourName, setYourName] = useState("");
  const [invite, setInvite] = useState(familyInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("create_household", {
      household_name: familyName.trim(),
      my_display_name: yourName.trim(),
      family_invite: invite.trim() || null,
    });
    if (error) {
      setBusy(false);
      setError(error.message.includes("family invite") ? text.needInvite : text.generic.replace("{message}", error.message));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <label htmlFor="familyName">{text.familyName}</label>
      <input
        id="familyName"
        required
        maxLength={80}
        placeholder={text.familyNamePlaceholder}
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
      />
      <label htmlFor="yourName">{text.yourName}</label>
      <input
        id="yourName"
        required
        maxLength={40}
        autoComplete="nickname"
        placeholder={text.yourNamePlaceholder}
        value={yourName}
        onChange={(e) => setYourName(e.target.value)}
      />
      <label htmlFor="invite">{text.familyInvite}</label>
      <input id="invite" autoCapitalize="none" value={invite} onChange={(e) => setInvite(e.target.value)} />
      <button type="submit" className="primary" disabled={busy || !familyName.trim() || !yourName.trim()}>
        {busy ? text.creating : text.create}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
