import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantBookingUrl, tenantAddress, TenantConfig } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkEmailRequest {
  to: string;
  subject: string;
  html: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-BULK-EMAIL] ${step}${detailsStr}`);
};

// Build branded email wrapper - wraps custom HTML content in branded template
const buildEmailTemplate = (tenant: TenantConfig, heading: string, bodyContent: string, ctaButton?: { text: string; url: string }) => {
  const buttonHtml = ctaButton ? `
              <!-- BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="${ctaButton.url}"
                       style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      ${ctaButton.text}
                    </a>
                  </td>
                </tr>
              </table>
  ` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${tenant.venue_name} Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!-- CONTAINER -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <div style="font-family:Anton, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <!-- SOCIAL ICONS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <!-- Instagram -->
                    <a href="https://www.instagram.com/${tenant.socials?.instagram || ''}" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <!-- Facebook -->
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <!-- CONTACT DETAILS -->
                <tr>
                  <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
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
        <!-- /CONTAINER -->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const tenant = await getTenant();

    const { to, subject, html }: BulkEmailRequest = await req.json();
    logStep("Request received", { to, subject: subject.substring(0, 50) });

    if (!to || !subject || !html) {
      throw new Error("Missing to, subject, or html");
    }

    // Wrap the custom HTML content in branded template
    // The html content becomes the body, subject becomes heading
    const bodyContent = `
              <div style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
                ${html}
              </div>
    `;
    
    const brandedHtml = buildEmailTemplate(tenant, subject, bodyContent, {
      text: `Visit ${tenant.venue_name}`,
      url: tenantBookingUrl(tenant)
    });

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [to],
      subject: subject,
      html: brandedHtml,
    });

    logStep("Email sent successfully", { emailResponse });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email sent successfully" 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});