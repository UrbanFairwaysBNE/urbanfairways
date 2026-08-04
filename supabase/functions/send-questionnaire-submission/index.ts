const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { submissionId, data, tradingName, contactEmail } = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

    const safe = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const rows = Object.entries(data || {})
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;color:#2F3134;vertical-align:top;width:240px;">${safe(
            k,
          )}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#222;white-space:pre-wrap;">${safe(
            v,
          )}</td></tr>`,
      )
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;padding:20px;background:#F5F3EF;">
        <div style="background:#2F3134;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:20px;">Sim Centre Questionnaire Submission</h2>
          <p style="margin:6px 0 0;font-size:14px;opacity:.9;">${safe(tradingName) || "(no trading name)"} — ${safe(contactEmail) || "(no contact email)"}</p>
        </div>
        <div style="background:#fff;padding:18px 22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 10px;color:#555;font-size:13px;">Submission ID: <code>${safe(submissionId)}</code></p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>
        </div>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Questionnaire <noreply@example.com>",
        to: ["admin@example.com"],
        reply_to: contactEmail || undefined,
        subject: `New Sim Centre Questionnaire — ${tradingName || "Submission"}`,
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
