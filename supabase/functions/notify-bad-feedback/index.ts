import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const { name, email, comment } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

    const customerName = name || "Anonymous";
    const customerEmail = email || "Not provided";
    const customerComment = comment || "No comment provided";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const body = `
      <p style="margin:0 0 12px; font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134;"><strong>Customer:</strong> ${customerName}</p>
      <p style="margin:0 0 12px; font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134;"><strong>Email:</strong> ${customerEmail}</p>
      <p style="margin:0 0 12px; font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134;"><strong>Rating:</strong> Bad</p>
      <p style="margin:0 0 6px; font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134;"><strong>Comment:</strong></p>
      <p style="margin:0; padding:12px; background:#FFFFFF; border-radius:8px; border:1px solid rgba(47,49,52,0.12); font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134;">${customerComment}</p>
    `;

    const html = await renderBrandedEmail(supabase, "BAD FEEDBACK RECEIVED", body, undefined, tenant);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${tenant.venue_name} Feedback <${tenant.sender_email}>`,
        to: [tenant.admin_alert_email],
        subject: `⚠️ Bad feedback from ${customerName}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
