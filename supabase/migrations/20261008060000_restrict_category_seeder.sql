-- A previous replacement of seed_default_categories retained explicit ACL grants
-- to anon and authenticated. This SECURITY DEFINER helper writes categories for
-- whichever household UUID is supplied, so it must never be called as a client RPC.
-- The SECURITY DEFINER create_household function invokes it as postgres (same owner).
revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;
grant execute on function public.seed_default_categories(uuid) to service_role;
