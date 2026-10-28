import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantBookingUrl, TenantConfig } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { unsubscribeToken, unsubscribeUrl, isMarketingSuppressed } from "../_shared/marketing-unsubscribe.ts";

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
              <div style="font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134;">
                ${html}
              </div>
    `;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    if (await isMarketingSuppressed(supabase, to)) {
      return new Response(JSON.stringify({ success: false, error: "This customer is unsubscribed from marketing emails" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const optOutUrl = unsubscribeUrl(tenant.booking_domain, to, await unsubscribeToken(to, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""));

    const brandedHtml = await renderBrandedEmail(
      supabase,
      subject,
      bodyContent,
      { text: `Visit ${tenant.venue_name}`, url: tenantBookingUrl(tenant) },
      tenant,
      optOutUrl,
    );

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [to],
      subject: subject,
      html: brandedHtml,
      headers: {
        "List-Unsubscribe": `<${Deno.env.get("SUPABASE_URL")}/functions/v1/marketing-unsubscribe?${new URL(optOutUrl).searchParams.toString()}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (emailResponse.error) throw new Error(emailResponse.error.message);

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