
REVOKE EXECUTE ON FUNCTION public.corporate_id_for_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pack_wallet_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_corporate_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.corporate_hours_used_this_month(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.corporate_id_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pack_wallet_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_corporate_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.corporate_hours_used_this_month(uuid) TO authenticated, service_role;
