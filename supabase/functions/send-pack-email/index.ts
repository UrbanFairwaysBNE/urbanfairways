import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantBookingUrl } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[SEND-PACK-EMAIL] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

type Kind = "purchase" | "gift" | "expiry_reminder";

const applyTags = (html: string, tags: Record<string, string>): string => {
  let out = html;
  for (const [tag, value] of Object.entries(tags)) {
    out = out.replaceAll(tag, value);
  }
  return out;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pack_lot_id, kind } = (await req.json()) as { pack_lot_id: string; kind: Kind };
    if (!pack_lot_id || !kind) throw new Error("pack_lot_id and kind required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lot } = await supabase
      .from("pack_lots")
      .select("*")
      .eq("id", pack_lot_id)
      .maybeSingle();
    if (!lot) throw new Error("Pack not found");

    const tenant = await getTenant();
    const accountUrl = tenantBookingUrl(tenant, "/my-account");

    let to: string | null = null;
    let subject = "";
    let heading = "";
    let body = "";
    let cta: { text: string; url: string } | undefined;

    const hours = Number(lot.hours_remaining ?? lot.hours_total);
    const expiryText = lot.expires_at
      ? new Date(lot.expires_at).toLocaleDateString("en-AU", {
          timeZone: tenant.timezone || "Australia/Brisbane",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : `${lot.validity_days} days from redemption`;

    if (kind === "gift") {
      to = lot.purchaser_email;
      subject = `Your ${lot.product_name} gift code`;
      heading = "Your gift pack is ready";
      body = `
        <p>Thanks for your purchase${lot.purchaser_name ? `, ${lot.purchaser_name}` : ""}.</p>
        <p>Here is the redemption code${lot.recipient_name ? ` for ${lot.recipient_name}` : ""}. Forward this email or pass the code on — they simply enter it in My Account to add the hours to their balance.</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:2px;margin:24px 0;">${lot.redemption_code}</p>
        <p><strong>${lot.product_name}</strong> — ${Number(lot.hours_total)} hours of simulator time, valid ${lot.validity_days} days from the day it is redeemed. Usable any time, any day.</p>
      `;
      cta = { text: "Redeem a pack", url: accountUrl };
    } else if (kind === "purchase") {
      to = lot.purchaser_email;
      subject = `${lot.product_name} added to your account`;
      heading = "Your prepaid hours are ready";
      body = `
        <p>Thanks for your purchase${lot.purchaser_name ? `, ${lot.purchaser_name}` : ""}.</p>
        <p><strong>${Number(lot.hours_total)} hours</strong> of simulator time have been added to your account. They can be used any time, any day, and can be combined with your card or account credit if a session costs more than the hours you have left.</p>
        <p>Your hours expire on <strong>${expiryText}</strong>.</p>
      `;
      cta = { text: "Book a bay", url: tenantBookingUrl(tenant, "/booking") };
    } else {
      // expiry_reminder
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, first_name")
        .eq("user_id", lot.user_id)
        .maybeSingle();
      to = profile?.email ?? null;
      subject = `Your prepaid hours expire soon`;
      heading = "Your prepaid hours expire in 7 days";
      body = `
        <p>Hi ${profile?.first_name || "there"},</p>
        <p>You still have <strong>${hours} hours</strong> left on your ${lot.product_name}, and they expire on <strong>${expiryText}</strong>.</p>
        <p>Book a session before then so they don't go to waste.</p>
      `;
      cta = { text: "Book a bay", url: tenantBookingUrl(tenant, "/booking") };
    }

    if (!to) throw new Error("No recipient email for this pack");

    const html = await renderBrandedEmail(supabase, heading, body, cta, tenant);

    await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [to],
      subject,
      html,
    });

    log("Sent", { pack_lot_id, kind, to });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
