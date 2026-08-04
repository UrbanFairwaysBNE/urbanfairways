import { getTenant } from "../_shared/tenant.ts";

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

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#FFF5E4;">
        <div style="background:#1F4C25;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:20px;">New Gate Access Request</h2>
          <p style="margin:6px 0 0;font-size:13px;opacity:.9;">Approve in the app to send Noke SMS invite.</p>
        </div>
        <div style="background:#fff;padding:20px 22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;font-weight:600;color:#1F4C25;width:120px;">Full Name</td><td style="padding:8px 0;color:#222;">${safe(fullName)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:600;color:#1F4C25;">Email</td><td style="padding:8px 0;color:#222;">${safe(email)}</td></tr>
            <tr><td style="padding:8px 0;font-weight:600;color:#1F4C25;">Phone</td><td style="padding:8px 0;color:#222;">${safe(phone)}</td></tr>
          </table>
        </div>
      </div>`;

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
