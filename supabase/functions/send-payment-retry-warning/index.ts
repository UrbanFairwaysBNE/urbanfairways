import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantHubUrl, tenantBookingUrl, tenantAddress, TenantConfig } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRetryRequest {
  email: string;
  first_name: string;
  amount?: number; // in dollars
  cancelled_bookings?: number;
}


const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-PAYMENT-RETRY-WARNING] ${step}${detailsStr}`);
};

const buildTemplate = (tenant: TenantConfig, firstName: string, amount?: number, cancelledBookings = 0) => {
  const amountLine = amount
    ? `<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">We tried to charge <strong>$${amount.toFixed(2)}</strong> for your weekly ${tenant.venue_name} membership and the payment didn't go through.</p>`
    : `<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">We tried to charge your card for your weekly ${tenant.venue_name} membership and the payment didn't go through.</p>`;

  const bookingsLine = cancelledBookings > 0
    ? `<p style="margin:0;">As a result, <strong>${cancelledBookings} upcoming booking${cancelledBookings === 1 ? " has" : "s have"} been cancelled and refunded</strong>, and no new bookings can be made until your card on file is updated.</p>`
    : `<p style="margin:0;">No new bookings can be made until your card on file is updated.</p>`;


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
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <div style="font-family:Anton, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">Payment Didn't Clear</h1>
              <p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Hi ${firstName},</p>
              ${amountLine}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEF3C7; border-radius:12px; margin:18px 0; border-left:4px solid #D97706;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#92400E;">
                    <h3 style="margin:0 0 10px 0; font-family:Anton, Impact, Arial Black, sans-serif; color:#92400E;">What This Means</h3>
                    ${bookingsLine}
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 8px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25; text-align:center;">Update your card on file and you'll be straight back in:</p>
              <p style="margin:0 0 4px; text-align:center;">
                <a href="${tenantHubUrl(tenant, "/my-account")}" style="display:inline-block; background-color:#EC622D; color:#FFFFFF; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; padding:12px 28px; border-radius:8px; text-decoration:none; letter-spacing:0.5px;">Update Card</a>
              </p>

            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="https://www.instagram.com/${tenant.socials?.instagram || ''}" style="margin:0 8px; text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" /></a>
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" /></a>
                  </td>
                </tr>
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
      </td>
    </tr>
  </table>
</body>
</html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const { email, first_name, amount, cancelled_bookings }: PaymentRetryRequest = await req.json();
    logStep("Request received", { email, first_name, amount, cancelled_bookings });

    if (!email) throw new Error("Missing email");

    const html = buildTemplate(tenant, first_name || "there", amount, cancelled_bookings ?? 0);

    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [email],
      subject: `Your ${tenant.venue_name} payment didn't clear — bookings on hold`,
      html,
    });


    logStep("Email sent", { emailResponse });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
