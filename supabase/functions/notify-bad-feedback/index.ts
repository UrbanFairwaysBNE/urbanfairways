import { getTenant } from "../_shared/tenant.ts";

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

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="background: #DC2626; color: white; padding: 16px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0;">⚠️ Bad Feedback Received</h2>
        </div>
        <div style="background: #F5F3EF; padding: 20px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 12px;"><strong>Customer:</strong> ${customerName}</p>
          <p style="margin: 0 0 12px;"><strong>Email:</strong> ${customerEmail}</p>
          <p style="margin: 0 0 12px;"><strong>Rating:</strong> 😟 Bad</p>
          <p style="margin: 0 0 4px;"><strong>Comment:</strong></p>
          <p style="margin: 0; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e5e5;">${customerComment}</p>
        </div>
      </div>
    `;

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
