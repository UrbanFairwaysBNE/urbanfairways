// Admin-only: mint a Cloudflare Stream "direct creator upload" URL so a recording
// can be uploaded manually from the browser, bypassing the Bay Controller entirely.
// Also supports action=status to check how Cloudflare processed that upload.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tenant = await getTenant();

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes } = await authClient.auth.getUser();
  if (!userRes?.user) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  if (!accountId || !token) return json({ error: "Cloudflare Stream credentials are not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "create";

  if (action === "status") {
    const uid = body.uid;
    if (!uid) return json({ error: "uid required" }, 400);
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const jsonBody = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: jsonBody?.errors?.[0]?.message ?? `status check failed (${res.status})` }, 502);
    const v = jsonBody.result ?? {};
    return json({
      uid,
      state: v.status?.state ?? null,
      pct: v.status?.pctComplete ?? null,
      error: v.status?.errorReasonText ?? null,
      size: v.size ?? null,
      duration: v.duration ?? null,
      playback_url: v.playback?.hls ?? null,
      preview: v.preview ?? null,
    });
  }

  // Create a one-time direct upload URL (browser PUT/POST, no CF token exposed).
  const maxDurationSeconds = Math.min(Math.max(Number(body.max_duration_seconds) || 21600, 60), 21600);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      maxDurationSeconds,
      requireSignedURLs: false,
      allowedOrigins: [tenant.booking_domain, `*.${tenant.booking_domain}`, "*.lovable.app", "localhost:8080"],
      meta: { name: body.name ?? `Manual test upload ${new Date().toISOString()}`, source: "manual-admin-test" },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.result?.uploadURL) {
    return json({ error: out?.errors?.[0]?.message ?? `direct_upload failed (${res.status})` }, 502);
  }

  return json({ upload_url: out.result.uploadURL, uid: out.result.uid });
});
