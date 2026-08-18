import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Reports which integration secrets are configured. Returns booleans ONLY —
 * never the secret values themselves. Admin-only.
 */
const SECRET_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_TERMINAL_READER_ID",
  "RESEND_API_KEY",
  "SINCH_SERVICE_PLAN_ID",
  "SINCH_API_TOKEN",
  "SINCH_FROM",
  "SMS_BROADCAST_USERNAME",
  "SMS_BROADCAST_PASSWORD",

  "SGT_API_KEY",
  "SGT_CLUB_URL",
  "SGT_USERNAME",
  "SGT_PASSWORD",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_STREAM_API_TOKEN",
  "TUYA_ACCESS_ID",
  "TUYA_ACCESS_SECRET",
  "TAPO_EMAIL",
  "TAPO_PASSWORD",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "OPENCLAW_API_KEY",
  "SITE_URL",
  "SYNC_SECRET",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleError) throw roleError;
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secrets: Record<string, boolean> = {};
    for (const key of SECRET_KEYS) {
      secrets[key] = (Deno.env.get(key) ?? "").trim().length > 0;
    }

    return new Response(JSON.stringify({ secrets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("[SETUP-STATUS] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
