import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantHubUrl, TenantConfig } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const buildEmailHtml = (tenant: TenantConfig, heading: string, bodyContent: string, ctaText: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${tenant.venue_name} Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F5F3EF;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F3EF;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
  <tr>
    <td align="center" style="background-color:#2F3134; padding:18px; border-radius:16px 16px 0 0;">
      <div style="font-family:Archivo, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
    </td>
  </tr>
  <tr>
    <td style="background-color:#F5F3EF; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">
      <h1 style="margin:0 0 14px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#2F3134; text-align:center;">
        ${heading}
      </h1>
      ${bodyContent}
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
        <tr>
          <td bgcolor="#B5772A" style="border-radius:12px;">
            <a href="${tenantHubUrl(tenant, "/admin/sgt-manager")}"
               style="display:inline-block; padding:14px 24px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
              ${ctaText}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background-color:#2F3134; padding:22px; border-radius:0 0 16px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="font-family:Manrope, Arial, sans-serif; font-size:12px; color:#F5F3EF; opacity:0.8;">
          <p style="margin:0;">© ${tenant.venue_name}</p>
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const { type } = await req.json();
    console.log(`[WINNER-REMINDER] Type: ${type}`);

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let subject: string;
    let htmlContent: string;

    if (type === "weekly") {
      // Get the most recent completed tournament for context
      const { data: recentTournament } = await supabase
        .from("sgt_tournaments")
        .select("name, course_name, end_date")
        .eq("status", "completed")
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const tournamentInfo = recentTournament
        ? `<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
            Latest completed tournament: <strong>${recentTournament.name}</strong>${recentTournament.course_name ? ` (${recentTournament.course_name})` : ""}
          </p>`
        : "";

      subject = "⏰ Reminder: Confirm This Week's League Winner";
      htmlContent = buildEmailHtml(
        tenant,
        "Weekly Winner Reminder",
        `<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
          It's Monday morning! Time to review and confirm this week's ${tenant.venue_name} League winner.
        </p>
        ${tournamentInfo}
        <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
          Head to the SGT Manager to approve the weekly prize and send the winner notification.
        </p>`,
        "Confirm Weekly Winner",
      );
    } else if (type === "monthly") {
      // Get previous month name
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthName = prevMonth.toLocaleString("en-AU", { month: "long", year: "numeric" });

      subject = `⏰ Reminder: Confirm ${monthName} Monthly League Winner`;
      htmlContent = buildEmailHtml(
        tenant,
        "Monthly Winner Reminder",
        `<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
          It's the start of a new month! Time to confirm the monthly league winner for <strong>${monthName}</strong>.
        </p>
        <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
          Head to the SGT Manager to review the monthly standings and approve the monthly prize.
        </p>`,
        "Confirm Monthly Winner",
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid type. Use 'weekly' or 'monthly'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${tenant.venue_name} <${tenant.sender_email}>`,
        to: [tenant.admin_alert_email],
        subject,
        html: htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("[WINNER-REMINDER] Resend error:", errorText);
      throw new Error(`Resend error: ${errorText}`);
    }

    const result = await emailResponse.json();
    console.log("[WINNER-REMINDER] Email sent:", result);

    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[WINNER-REMINDER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
