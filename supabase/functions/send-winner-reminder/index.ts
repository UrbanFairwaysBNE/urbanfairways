import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantHubUrl, TenantConfig } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const buildEmailHtml = (
  supabase: any,
  tenant: TenantConfig,
  heading: string,
  bodyContent: string,
  ctaText: string,
) =>
  renderBrandedEmail(
    supabase,
    heading,
    bodyContent,
    { text: ctaText, url: tenantHubUrl(tenant, "/admin/sgt-manager") },
    tenant,
  );

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
      htmlContent = await buildEmailHtml(
        supabase,
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
      htmlContent = await buildEmailHtml(
        supabase,
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
