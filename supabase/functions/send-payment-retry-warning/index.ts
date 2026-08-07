import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantHubUrl, TenantConfig } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

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

const buildBody = (tenant: TenantConfig, firstName: string, amount?: number, cancelledBookings = 0) => {
  const amountLine = amount
    ? `<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">We tried to charge <strong>$${amount.toFixed(2)}</strong> for your weekly ${tenant.venue_name} membership and the payment didn't go through.</p>`
    : `<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">We tried to charge your card for your weekly ${tenant.venue_name} membership and the payment didn't go through.</p>`;

  const bookingsLine = cancelledBookings > 0
    ? `<p style="margin:0;">As a result, <strong>${cancelledBookings} upcoming booking${cancelledBookings === 1 ? " has" : "s have"} been cancelled and refunded</strong>, and no new bookings can be made until your card on file is updated.</p>`
    : `<p style="margin:0;">No new bookings can be made until your card on file is updated.</p>`;

  return `
    <p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">Hi ${firstName},</p>
    ${amountLine}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEF3C7; border-radius:12px; margin:18px 0; border-left:4px solid #D97706;">
      <tr>
        <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#92400E;">
          <h3 style="margin:0 0 10px 0; font-family:Archivo, Impact, Arial Black, sans-serif; color:#92400E;">What This Means</h3>
          ${bookingsLine}
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 8px; font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#2F3134; text-align:center;">Update your card on file and you'll be straight back in:</p>
  `;
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const html = await renderBrandedEmail(
      supabase,
      "PAYMENT DIDN'T CLEAR",
      buildBody(tenant, first_name || "there", amount, cancelled_bookings ?? 0),
      { text: "Update Card", url: tenantHubUrl(tenant, "/my-account") },
      tenant,
    );

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
