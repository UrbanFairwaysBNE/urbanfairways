import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantHubUrl, tenantBookingUrl, tenantAddress } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-PASSWORD-RESET] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const tenant = await getTenant();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const { email, firstName, redirectUrl } = await req.json();
    
    if (!email) {
      throw new Error("Email is required");
    }

    logStep("Generating password reset link", { email });

    // Generate a password recovery link using the auth admin API.
    // We email a safe app URL carrying the token hash instead of the one-time verify link,
    // which helps avoid mail scanners burning the token before the customer clicks it.
    const rawSiteUrl = Deno.env.get("SITE_URL") || tenantHubUrl(tenant);
    const siteUrl = /^https?:\/\//i.test(rawSiteUrl) ? rawSiteUrl.replace(/\/$/, "") : `https://${rawSiteUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
    const siteOrigin = new URL(`${siteUrl}/`).origin;
    const requestedRedirect = (redirectUrl || "/reset-password").trim() || "/reset-password";
    const requestedUrl = new URL(requestedRedirect, `${siteOrigin}/`);
    const redirectDestination = new URL(
      `${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}` || "/reset-password",
      `${siteOrigin}/`
    );
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectDestination.toString(),
      },
    });

    if (linkError) {
      logStep("Error generating link", { error: linkError.message });
      throw linkError;
    }

    logStep("Link generated successfully");

    const resetUrl = new URL(redirectDestination.toString());
    resetUrl.searchParams.set("type", "recovery");
    resetUrl.searchParams.set("email", email);

    if (linkData.properties.email_otp) {
      resetUrl.searchParams.set("token", linkData.properties.email_otp);
    }

    if (linkData.properties.hashed_token) {
      resetUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
    }

    const resetLink = resetUrl.toString();
    const name = firstName || "there";

    // Build branded email matching other tenant emails
    const bodyContent = `
              <p style="font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#333333; margin:0 0 16px;">
                Hi ${name}!
              </p>
              <p style="font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#333333; margin:0 0 16px;">
                You've been invited to set up your password for your ${tenant.venue_name} account, or you requested a password reset.
              </p>
              <p style="font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#333333; margin:0 0 6px;">
                Click the button below to set your password:
              </p>
    `;

    const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Set Your ${tenant.venue_name} Password</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F5F3EF;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F3EF;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#2F3134; padding:18px; border-radius:16px 16px 0 0;">
              <div style="font-family:Archivo, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background-color:#F5F3EF; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">
              <h1 style="margin:0 0 14px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#2F3134; text-align:center;">
                Set Your Password
              </h1>
              ${bodyContent}
              <!-- BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#B5772A" style="border-radius:12px;">
                    <a href="${resetLink}"
                       style="display:inline-block; padding:14px 24px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      Set Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-family:Manrope, Arial, sans-serif; font-size:13px; line-height:1.5; color:#999999; margin:24px 0 0; text-align:center;">
                This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#2F3134; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="https://www.instagram.com/${tenant.socials?.instagram || ''}" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
                    <div>${tenantAddress(tenant)}</div>
                    <div><a href="tel:${tenant.support_phone}" style="color:#FFFFFF; text-decoration:underline;">${tenant.support_phone}</a></div>
                    <div><a href="${tenantBookingUrl(tenant)}" style="color:#FFFFFF; text-decoration:underline;">${tenant.booking_domain}</a></div>
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

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [email],
      subject: `Set Your ${tenant.venue_name} Password`,
      html: htmlContent,
    });

    logStep("Email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
