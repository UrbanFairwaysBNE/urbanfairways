import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const tenant = await getTenant();
    const { fullName, email, phone } = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

    if (!fullName || !email || !phone) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safe = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const body = `
      <p style="margin:0 0 16px; font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134; text-align:center;">Approve in the app to send the access invite.</p>
      <table role="presentation" style="width:100%; border-collapse:collapse; font-family:Manrope, Arial, sans-serif; font-size:16px; color:#2F3134;">
        <tr><td style="padding:8px 0; font-weight:600; width:120px;">Full Name</td><td style="padding:8px 0;">${safe(fullName)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:600;">Email</td><td style="padding:8px 0;">${safe(email)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:600;">Phone</td><td style="padding:8px 0;">${safe(phone)}</td></tr>
      </table>
    `;

    const html = await renderBrandedEmail(supabase, "NEW GATE ACCESS REQUEST", body, undefined, tenant);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${tenant.venue_name} Gate Access <${tenant.sender_email}>`,
        to: [tenant.support_email],
        reply_to: email,
        subject: `Gate Access Request — ${fullName}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
