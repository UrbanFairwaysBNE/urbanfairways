import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CAMPAIGN_KEY = "byo_2026_05_30";

const log = (s: string, d?: unknown) =>
  console.log(`[BYO-ALERT] ${s}${d ? " " + JSON.stringify(d) : ""}`);

const formatPhoneForSMS = (phone: string | null): string | null => {
  if (!phone) return null;
  let c = phone.replace(/\D/g, "");
  if (c.startsWith("0")) c = "61" + c.slice(1);
  else if (c.startsWith("+61")) c = c.slice(1);
  else if (!c.startsWith("61") && c.length === 9) c = "61" + c;
  if (c.length !== 11 || !c.startsWith("614")) return null;
  return c;
};

const sendSMS = async (phone: string, message: string, senderName: string) => {
  const username = Deno.env.get("SMS_BROADCAST_USERNAME");
  const password = Deno.env.get("SMS_BROADCAST_PASSWORD");
  if (!username || !password) return { success: false, error: "no creds" };
  const formatted = formatPhoneForSMS(phone);
  if (!formatted) return { success: false, error: "bad phone" };
  const params = new URLSearchParams({
    username, password, to: formatted, from: senderName, message,
  });
  try {
    const r = await fetch(`https://api.smsbroadcast.com.au/api-adv.php?${params.toString()}`);
    const txt = await r.text();
    return txt.startsWith("OK:")
      ? { success: true, response: txt, phone: formatted }
      : { success: false, error: txt, phone: formatted };
  } catch (e) {
    return { success: false, error: (e as Error).message, phone: formatted };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const tenant = await getTenant();
  const MESSAGE =
    `${tenant.venue_name}: Heads up — staff are off sick tonight with no cover. BYO drinks/food welcome tonight only. Remote assistance available on 0481 600 981. Apologies for the inconvenience!`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Today's date in Brisbane (AEST, UTC+10, no DST)
  const nowBris = new Date(Date.now() + 10 * 60 * 60 * 1000);
  const today = nowBris.toISOString().slice(0, 10);

  log("Running for date", { today });

  // Find today's confirmed bookings starting 16:00–20:59:59
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, user_id, start_time, end_time, status, booking_date")
    .eq("booking_date", today)
    .eq("status", "confirmed")
    .gte("start_time", "16:00:00")
    .lt("start_time", "21:00:00");

  if (bErr) {
    log("Booking query error", bErr);
    return new Response(JSON.stringify({ error: bErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!bookings || bookings.length === 0) {
    return new Response(JSON.stringify({ processed: 0, sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Filter out bookings already sent for this campaign
  const ids = bookings.map((b) => b.id);
  const { data: alreadySent } = await supabase
    .from("adhoc_sms_log")
    .select("booking_id")
    .eq("campaign_key", CAMPAIGN_KEY)
    .in("booking_id", ids);
  const sentSet = new Set((alreadySent ?? []).map((r) => r.booking_id));
  const todo = bookings.filter((b) => !sentSet.has(b.id));

  log("Bookings to message", { total: bookings.length, todo: todo.length });

  // Load phones
  const userIds = [...new Set(todo.map((b) => b.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, phone, first_name")
    .in("user_id", userIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  let sent = 0, failed = 0;
  for (const b of todo) {
    const prof = profileMap.get(b.user_id);
    if (!prof?.phone) {
      await supabase.from("adhoc_sms_log").insert({
        booking_id: b.id, campaign_key: CAMPAIGN_KEY,
        success: false, response: "no phone on profile",
      });
      failed++;
      continue;
    }
    const result = await sendSMS(prof.phone, MESSAGE, tenant.venue_name);
    await supabase.from("adhoc_sms_log").insert({
      booking_id: b.id,
      campaign_key: CAMPAIGN_KEY,
      phone: result.phone ?? prof.phone,
      success: result.success,
      response: result.success ? result.response : result.error,
    });
    if (result.success) sent++; else failed++;
  }

  log("Done", { sent, failed });

  return new Response(JSON.stringify({
    processed: todo.length, sent, failed, total_eligible: bookings.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
