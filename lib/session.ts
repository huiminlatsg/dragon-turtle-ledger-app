import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Membership = {
  householdId: string;
  familyName: string;
  displayName: string;
  role: "owner" | "member" | "viewer";
};

/** The signed-in user, or a redirect to sign-in. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** The signed-in user's family, or null if they haven't joined one yet. */
export async function getMembership(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string; membership: Membership | null }> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("members")
    .select("household_id, display_name, role, households(name)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { supabase, userId: user.id, membership: null };
  const household = data.households as unknown as { name: string } | null;
  return {
    supabase,
    userId: user.id,
    membership: {
      householdId: data.household_id as string,
      familyName: household?.name ?? "",
      displayName: data.display_name as string,
      role: data.role as Membership["role"],
    },
  };
}

/** Pages inside the app: signed in and in a family, else sent to set up. */
export async function requireMembership() {
  const result = await getMembership();
  if (!result.membership) redirect("/welcome");
  return { ...result, membership: result.membership };
}
