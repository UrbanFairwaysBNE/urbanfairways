import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantHubUrl, tenantBookingUrl, tenantAddress } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

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

    const htmlContent = await renderBrandedEmail(
      supabaseAdmin,
      "SET YOUR PASSWORD",
      `${bodyContent}
      <p style="font-family:Manrope, Arial, sans-serif; font-size:13px; line-height:1.5; color:#7A7A7A; margin:24px 0 0; text-align:center;">
        This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.
      </p>`,
      { text: "Set Password", url: resetLink },
      tenant,
    );

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
