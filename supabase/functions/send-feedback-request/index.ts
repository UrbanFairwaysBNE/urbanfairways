import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantBookingUrl, tenantAddress, TenantConfig } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FEEDBACK-REQUEST] ${step}${detailsStr}`);
};

const normalizeSiteUrl = (rawUrl: string | undefined) => {
  const fallbackUrl = "https://birdie-bay-bookings.lovable.app";
  if (!rawUrl) return fallbackUrl;

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return fallbackUrl;

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl.replace(/\/$/, "");
  }

  return `https://${trimmedUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
};

const SITE_URL = normalizeSiteUrl(Deno.env.get("SITE_URL"));

const buildFeedbackLinks = (token: string) => {
  const encodedToken = encodeURIComponent(token);
  const feedbackUrl = `${SITE_URL}/feedback?token=${encodedToken}`;

  return {
    feedbackUrl,
    feedbackUrlBad: `${feedbackUrl}&quick=bad`,
    feedbackUrlOk: `${feedbackUrl}&quick=ok`,
    feedbackUrlGood: `${feedbackUrl}&quick=good`,
  };
};

const buildFeedbackEmail = (tenant: TenantConfig, _firstName: string, _feedbackUrl: string) => {
  const mapsQuery = encodeURIComponent(tenantAddress(tenant));
  const phoneDigits = (tenant.support_phone || "").replace(/[^\d+]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <div style="font-family:Anton, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background-color:#FFF5E4; padding:30px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 16px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:30px; line-height:1.1; color:#1F4C25; text-align:center;">
                THANKS FOR PLAYING!
              </h1>
              <p style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center; margin:0 0 8px;">
                Hey {{first_name}},
              </p>
              <p style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center; margin:0 0 24px;">
                Thanks for your first session at ${tenant.venue_name} — we hope you had a blast! We'd love to hear how it went. It only takes 10 seconds.
              </p>
              
              <!-- FEEDBACK BUTTONS -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
                <tr>
                  <td align="center" style="padding:0 8px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{feedback_url_bad}}" style="height:56px;v-text-anchor:middle;width:56px;" arcsize="21%" fillcolor="#FEE2E2" stroke="f"><v:textbox><center><![endif]-->
                    <a href="{{feedback_url_bad}}" target="_blank" rel="noopener noreferrer" style="display:block; padding:14px 20px; font-family:Inter, Arial, sans-serif; font-size:28px; line-height:28px; text-decoration:none; background-color:#FEE2E2; border-radius:12px; text-align:center; mso-hide:all;">&#128543;</a>
                    <!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
                  </td>
                  <td align="center" style="padding:0 8px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{feedback_url_ok}}" style="height:56px;v-text-anchor:middle;width:56px;" arcsize="21%" fillcolor="#FEF3C7" stroke="f"><v:textbox><center><![endif]-->
                    <a href="{{feedback_url_ok}}" target="_blank" rel="noopener noreferrer" style="display:block; padding:14px 20px; font-family:Inter, Arial, sans-serif; font-size:28px; line-height:28px; text-decoration:none; background-color:#FEF3C7; border-radius:12px; text-align:center; mso-hide:all;">&#128528;</a>
                    <!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
                  </td>
                  <td align="center" style="padding:0 8px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{feedback_url_good}}" style="height:56px;v-text-anchor:middle;width:56px;" arcsize="21%" fillcolor="#D1FAE5" stroke="f"><v:textbox><center><![endif]-->
                    <a href="{{feedback_url_good}}" target="_blank" rel="noopener noreferrer" style="display:block; padding:14px 20px; font-family:Inter, Arial, sans-serif; font-size:28px; line-height:28px; text-decoration:none; background-color:#D1FAE5; border-radius:12px; text-align:center; mso-hide:all;">&#128522;</a>
                    <!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 8px 0; text-align:center; font-family:Inter, Arial, sans-serif; font-size:12px; color:#1F4C25;"><a href="{{feedback_url_bad}}" target="_blank" rel="noopener noreferrer" style="color:#1F4C25; text-decoration:none;">Bad</a></td>
                  <td style="padding:4px 8px 0; text-align:center; font-family:Inter, Arial, sans-serif; font-size:12px; color:#1F4C25;"><a href="{{feedback_url_ok}}" target="_blank" rel="noopener noreferrer" style="color:#1F4C25; text-decoration:none;">OK</a></td>
                  <td style="padding:4px 8px 0; text-align:center; font-family:Inter, Arial, sans-serif; font-size:12px; color:#1F4C25;"><a href="{{feedback_url_good}}" target="_blank" rel="noopener noreferrer" style="color:#1F4C25; text-decoration:none;">Good</a></td>
                </tr>
              </table>

              <p style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.5; color:#1F4C25; text-align:center; opacity:0.7; margin:0;">
                Tap an emoji above or click below to leave more detailed feedback
              </p>

              <!-- CTA BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{feedback_url}}" style="height:46px;v-text-anchor:middle;width:200px;" arcsize="26%" fillcolor="#EC622D" stroke="f"><v:textbox><center><![endif]-->
                    <a href="{{feedback_url}}" target="_blank" rel="noopener noreferrer"
                       style="display:block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none; text-align:center;">
                      GIVE FEEDBACK
                    </a>
                    <!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="${tenant.socials?.instagram ?? "#"}" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <a href="${tenant.socials?.facebook ?? "#"}" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
                    <div><a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" style="color:#FFFFFF; text-decoration:underline;">${tenantAddress(tenant)}</a></div>
                    <div><a href="tel:${phoneDigits}" style="color:#FFFFFF; text-decoration:underline;">${tenant.support_phone}</a></div>
                    <div><a href="${tenantBookingUrl(tenant, "/")}" style="color:#FFFFFF; text-decoration:underline;">${tenant.booking_domain}</a></div>
                    <div style="margin-top:10px; font-size:12px; opacity:0.75;">© ${tenant.venue_name}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// Render template by replacing placeholders
const renderTemplate = (template: string, vars: Record<string, string>) => {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();

    // Parse request body for test mode
    let testEmail: string | null = null;
    let testName: string | null = null;
    try {
      const body = await req.json();
      testEmail = body?.test_email || null;
      testName = body?.test_name || null;
    } catch { /* no body or not JSON */ }

    // TEST MODE: send directly to a specific email without eligibility checks
    if (testEmail) {
      logStep("TEST MODE - sending to", { testEmail });

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      let emailTemplate = buildFeedbackEmail(tenant, "", "");
      const { data: templateRow } = await supabase
        .from("email_templates")
        .select("html_content")
        .eq("template_key", "feedback_request")
        .eq("is_active", true)
        .single();

      if (templateRow?.html_content) {
        emailTemplate = templateRow.html_content;
      } else {
        emailTemplate = buildFeedbackEmail(tenant, "{{first_name}}", "{{feedback_url}}");
      }

      const testLinks = buildFeedbackLinks("test-preview");
      const renderedHtml = renderTemplate(emailTemplate, {
        first_name: testName || "there",
         feedback_url: testLinks.feedbackUrl,
         feedback_url_bad: testLinks.feedbackUrlBad,
         feedback_url_ok: testLinks.feedbackUrlOk,
         feedback_url_good: testLinks.feedbackUrlGood,
      });

      await resend.emails.send({
        from: `${tenant.venue_name} <${tenant.sender_email}>`,
        to: [testEmail],
        subject: `Thanks for playing at ${tenant.venue_name}! How was it? 🏌️`,
        html: renderedHtml,
      });

      logStep("TEST email sent", { testEmail });
      return new Response(
        JSON.stringify({ success: true, test: true, sent_to: testEmail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Function started - Post-first-session feedback (24hr)");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Try to load template from email_templates table
    let emailTemplate = buildFeedbackEmail(tenant, "", "");
    const { data: templateRow } = await supabase
      .from("email_templates")
      .select("html_content")
      .eq("template_key", "feedback_request")
      .eq("is_active", true)
      .single();

    if (templateRow?.html_content) {
      emailTemplate = templateRow.html_content;
      logStep("Using template from email_templates table");
    } else {
      emailTemplate = buildFeedbackEmail(tenant, "{{first_name}}", "{{feedback_url}}");
      logStep("Using default hardcoded template");
    }

    // Window: bookings that occurred 24-48 hours ago (gives a day buffer)
    const now = new Date();
    const twentyFourHoursAgo = new Date(now);
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    const fortyEightHoursAgo = new Date(now);
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    // We use booking_date (date only), so calculate date range
    // A booking_date that is 1-2 days ago means the session was yesterday or day before
    const yesterdayDate = twentyFourHoursAgo.toISOString().split("T")[0];
    const twoDaysAgoDate = fortyEightHoursAgo.toISOString().split("T")[0];

    logStep("Date window", { yesterdayDate, twoDaysAgoDate });

    // Get all profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, marketing_opt_out");

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No profiles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get already-sent user IDs (never send twice)
    const { data: alreadySent } = await supabase
      .from("feedback_emails_sent")
      .select("user_id");
    const sentUserIds = new Set((alreadySent || []).map((s: any) => s.user_id));

    // Get all confirmed bookings grouped by user
    const { data: allBookings } = await supabase
      .from("bookings")
      .select("user_id, booking_date")
      .eq("status", "confirmed")
      .order("booking_date", { ascending: true });

    // Build map: user_id -> { firstBookingDate, totalBookings }
    const bookingMap = new Map<string, { firstDate: string; count: number }>();
    for (const b of (allBookings || [])) {
      const existing = bookingMap.get(b.user_id);
      if (!existing) {
        bookingMap.set(b.user_id, { firstDate: b.booking_date, count: 1 });
      } else {
        existing.count++;
        // Since ordered ascending, first entry is already the earliest
      }
    }

    logStep("Data loaded", {
      profiles: profiles.length,
      bookings: allBookings?.length,
      alreadySent: sentUserIds.size,
    });

    // Find candidates: users whose FIRST EVER booking was 1-2 days ago
    const candidates: Array<{ user_id: string; email: string; first_name: string }> = [];
    for (const profile of profiles) {
      if (sentUserIds.has(profile.user_id)) continue;
      if (profile.marketing_opt_out) continue;

      const bookingInfo = bookingMap.get(profile.user_id);
      if (!bookingInfo) continue; // no bookings

      // First booking must be within our 24-48hr window
      // (booking_date between twoDaysAgoDate and yesterdayDate inclusive)
      if (bookingInfo.firstDate < twoDaysAgoDate || bookingInfo.firstDate > yesterdayDate) continue;

      candidates.push({
        user_id: profile.user_id,
        email: profile.email,
        first_name: profile.first_name,
      });
    }

    logStep("Eligible candidates (first session 24-48hrs ago)", { count: candidates.length });

    let sentCount = 0;

    for (const user of candidates) {
      try {
        // Create tracking record
        const { data: trackingRecord, error: insertError } = await supabase
          .from("feedback_emails_sent")
          .insert({ user_id: user.user_id, email: user.email })
          .select("id")
          .single();

        if (insertError) {
          logStep("Skip - insert error", { email: user.email, error: insertError.message });
          continue;
        }

        const token = trackingRecord.id;
        const links = buildFeedbackLinks(token);

        const renderedHtml = renderTemplate(emailTemplate, {
          first_name: user.first_name || "there",
          feedback_url: links.feedbackUrl,
          feedback_url_bad: links.feedbackUrlBad,
          feedback_url_ok: links.feedbackUrlOk,
          feedback_url_good: links.feedbackUrlGood,
        });

        await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [user.email],
          subject: `Thanks for playing at ${tenant.venue_name}! How was it? 🏌️`,
          html: renderedHtml,
        });

        sentCount++;
        logStep("Email sent", { email: user.email });

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        logStep("Error sending to user", { email: user.email, error: err.message });
      }
    }

    logStep("Complete", { totalSent: sentCount });

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, eligible: candidates.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
