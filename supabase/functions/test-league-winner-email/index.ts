import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getTenant, tenantBookingUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { playerName, tournamentName, prizeAmount, testEmail } = await req.json();
    const tenant = await getTenant();

    if (!playerName || !tournamentName || !prizeAmount || !testEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Email template HTML with variables replaced
    const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${tenant.venue_name} Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@400;600&display=swap");
  </style>
</head>

<body style="margin:0; padding:0; background-color:#F5F3EF;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F3EF;">
<tr>
<td align="center" style="padding:24px 12px;">

<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">

<!-- Header -->
<tr>
<td align="center" style="background-color:#2F3134; padding:18px; border-radius:16px 16px 0 0;">
  <img src="${tenantBookingUrl(tenant, "/__l5e/assets-v1/9691088f-3b4b-41b4-bcb3-d4cd4de1540c/venue-logo-email.png")}" width="140" alt="${tenant.venue_name}" style="display:block; width:140px; height:auto; border:0;" />
</td>
</tr>

<!-- Main Content -->
<tr>
<td style="background-color:#F5F3EF; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">

<h1 style="margin:0 0 14px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#2F3134; text-align:center;">
🏆 Congratulations! 🏆
</h1>

<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
Hi ${playerName},
</p>

<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
Amazing work! You've won this week's Birdies League tournament!
</p>

<!-- Prize Box -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#2F3134; border-radius:12px; margin:18px 0;">
<tr>
<td style="padding:30px; text-align:center;">

<p style="margin:0 0 6px; font-family:Manrope, Arial, sans-serif; font-size:14px; color:#F5F3EF; opacity:0.9;">
Tournament
</p>

<p style="margin:0 0 16px; font-family:Manrope, Arial, sans-serif; font-size:18px; color:#FFFFFF; font-weight:600;">
${tournamentName}
</p>

<p style="margin:0 0 8px; font-family:Manrope, Arial, sans-serif; font-size:14px; color:#F5F3EF; opacity:0.9;">
Your Prize
</p>

<p style="margin:0; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:52px; color:#B5772A;">
${prizeAmount}
</p>

</td>
</tr>
</table>

<p style="margin:18px 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
Your credit has been added to your Birdies account and can be used for:
</p>

<ul style="margin:0 0 20px; padding-left:20px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.8; color:#2F3134;">
<li>Future bay bookings</li>
<li>In-store purchases at Birdies</li>
</ul>

<p style="margin:18px 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
Keep up the momentum! See you at the next tournament.
</p>

<!-- Button -->
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
<tr>
<td bgcolor="#B5772A" style="border-radius:12px;">

<a href="https://hub.birdiesbayside.com.au/my-account"
style="display:inline-block; padding:14px 28px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
View My Account
</a>

</td>
</tr>
</table>

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#2F3134; padding:22px; border-radius:0 0 16px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

<tr>
<td align="center" style="padding-bottom:14px;">

<a href="https://www.instagram.com/birdiesbayside/" style="display:inline-block; margin:0 6px;">
<img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" width="28" alt="Instagram" style="border:0;" />
</a>

<a href="https://www.facebook.com/birdiesbayside" style="display:inline-block; margin:0 6px;">
<img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" width="28" alt="Facebook" style="border:0;" />
</a>

</td>
</tr>

<tr>
<td align="center" style="font-family:Manrope, Arial, sans-serif; font-size:12px; color:#F5F3EF; opacity:0.8;">
<p style="margin:0; padding:0 8px;">© 2025 Birdies Bayside. All rights reserved.</p>
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

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.error("[TEST-LEAGUE-WINNER] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Birdies <noreply@birdiesbayside.com.au>",
        to: [testEmail],
        subject: `Congratulations! You Won ${tournamentName}`,
        html: htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("[TEST-LEAGUE-WINNER] Resend error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailResult = await emailResponse.json();
    console.log("[TEST-LEAGUE-WINNER] Email sent successfully:", emailResult);

    return new Response(
      JSON.stringify({ success: true, message: "Test email sent successfully", emailId: emailResult.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[TEST-LEAGUE-WINNER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
