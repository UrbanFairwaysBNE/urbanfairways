import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[EXPIRE-PACK-LOTS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Reminders — active lots with hours left expiring within 7 days
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiring } = await supabase
      .from("pack_lots")
      .select("id")
      .eq("status", "active")
      .is("reminder_sent_at", null)
      .not("user_id", "is", null)
      .gt("hours_remaining", 0)
      .lte("expires_at", in7Days)
      .gt("expires_at", new Date().toISOString());

    let reminders = 0;
    for (const lot of expiring ?? []) {
      try {
        await supabase.functions.invoke("send-pack-email", {
          body: { pack_lot_id: lot.id, kind: "expiry_reminder" },
        });
        await supabase
          .from("pack_lots")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", lot.id);
        reminders++;
      } catch (e) {
        log("Reminder failed", { lotId: lot.id, error: String(e) });
      }
    }

    // 2. Expire anything past its expiry date
    const { data: expiredCount, error: expireErr } = await supabase.rpc("expire_pack_lots");
    if (expireErr) throw expireErr;

    log("Done", { reminders, expired: expiredCount });

    return new Response(JSON.stringify({ success: true, reminders, expired: expiredCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
