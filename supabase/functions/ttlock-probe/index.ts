import { TTLockClient, getTTLockCredentials } from "../_shared/ttlock.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Temporary read-only connection check: returns lock names and online status only.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const creds = getTTLockCredentials();
    if (!creds) throw new Error("TTLock credentials missing");
    const c = new TTLockClient(creds);
    const { list } = await c.listLocks();
    const locks = [];
    for (const l of list ?? []) {
      const d: any = await c.lockDetail(l.lockId as number).catch(() => ({}));
      locks.push({
        lockId: l.lockId, name: l.lockAlias ?? l.lockName, battery: l.electricQuantity,
        hasGateway: l.hasGateway, featureValue: d.featureValue, isAdmin: l.userType === "110301",
        keyRight: l.keyRight,
      });
    }
    return new Response(JSON.stringify({ ok: true, locks }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
