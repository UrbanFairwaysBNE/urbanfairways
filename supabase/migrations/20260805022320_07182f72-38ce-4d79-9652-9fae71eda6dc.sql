REVOKE EXECUTE ON FUNCTION public.pack_hours_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.consume_pack_hours(uuid, numeric, text, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_pack_hours(uuid, numeric, text, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.redeem_pack_code(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.expire_pack_lots() FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.pack_hours_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_pack_hours(uuid, numeric, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_pack_hours(uuid, numeric, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_pack_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_pack_lots() TO service_role;