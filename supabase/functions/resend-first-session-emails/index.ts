import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantHubUrl, TenantConfig } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RESEND-FIRST-SESSION] ${step}${detailsStr}`);
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    logStep("Function started - Resending First Session Free emails");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for options
    let dryRun = false;
    try {
      const body = await req.text();
      if (body) {
        const options = JSON.parse(body);
        dryRun = options.dry_run ?? false;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    logStep("Options", { dryRun });

    // Find users who received the promo (first_session_promo_sent is set)
    // These are the ones who got credits but may not have received the email
    const { data: promoRecipients, error: fetchError } = await supabase
      .from("profiles")
      .select("id, user_id, email, first_name, last_name, first_session_promo_sent")
      .not("first_session_promo_sent", "is", null)
      .order("first_session_promo_sent", { ascending: false });

    if (fetchError) {
      throw new Error(`Failed to fetch profiles: ${String(fetchError)}`);
    }

    logStep("Found promo recipients", { count: promoRecipients?.length || 0 });

    if (!promoRecipients || promoRecipients.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No promo recipients found to resend to",
          count: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Dry run - just return the list
    if (dryRun) {
      logStep("Dry run mode - returning recipient list");
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          count: promoRecipients.length,
          recipients: promoRecipients.map(u => ({
            email: u.email,
            first_name: u.first_name,
            last_name: u.last_name,
            promo_sent_at: u.first_session_promo_sent,
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Fetch email template
    let template: { subject: string; html_content: string } | null = null;
    
    const { data: marketingTemplate } = await supabase
      .from("marketing_templates")
      .select("subject, html_content")
      .eq("name", "First Session Free")
      .eq("is_active", true)
      .maybeSingle();

    if (marketingTemplate) {
      template = marketingTemplate;
      logStep("Using marketing template");
    } else {
      const { data: emailTemplate } = await supabase
        .from("email_templates")
        .select("subject, html_content")
        .eq("template_key", "first_session_promo")
        .eq("is_active", true)
        .maybeSingle();
      template = emailTemplate;
    }

    // Process and send emails
    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    const BATCH_DELAY_MS = 600; // Rate limiting delay

    for (let i = 0; i < promoRecipients.length; i++) {
      const user = promoRecipients[i];
      
      try {
        logStep(`Sending email ${i + 1}/${promoRecipients.length}`, { email: user.email });

        const templateTags: Record<string, string> = {
          '{first_name}': user.first_name || 'there',
          '{last_name}': user.last_name || '',
          '{email}': user.email || '',
        };

        let subject = template?.subject || "Your Free Hour is Waiting, {first_name}!";
        let htmlContent = template?.html_content || getDefaultTemplate(tenant);

        subject = replaceTemplateTags(subject, templateTags);
        htmlContent = replaceTemplateTags(htmlContent, templateTags);

        const emailResponse = await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [user.email],
          subject,
          html: await renderBrandedEmail(
            supabase,
            "A Gift From Us To You!",
            htmlContent,
            { text: "Book Your Free Session", url: tenantHubUrl(tenant, "/booking") },
            tenant,
          ),
        });

        if (emailResponse.error) {
          logStep("Email send error", { email: user.email, error: emailResponse.error });
          results.errors.push(`Email failed for ${user.email}: ${emailResponse.error.message}`);
          results.failed++;
        } else {
          logStep("Email sent successfully", { email: user.email, emailId: emailResponse.data?.id });
          results.success++;
        }

        results.processed++;

        // Rate limiting delay
        if (i < promoRecipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Error sending email", { email: user.email, error: errorMessage });
        results.errors.push(`Failed for ${user.email}: ${errorMessage}`);
        results.failed++;
        results.processed++;
      }
    }

    logStep("Resend complete", results);

    // Send admin report
    const customerList = promoRecipients.map(u => 
      `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${u.first_name} ${u.last_name}</td><td style="padding:8px;border-bottom:1px solid #eee;">${u.email}</td></tr>`
    ).join('');

    const reportBody = `
      <p style="color:#333;font-size:16px;margin:0 0 16px;">Manual resend of First Session Free emails (fixing wrong sender address issue).</p>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;"><strong>Total Processed:</strong> ${results.processed}</p>
        <p style="margin:0 0 8px;"><strong>Successful:</strong> ${results.success}</p>
        <p style="margin:0;"><strong>Failed:</strong> ${results.failed}</p>
      </div>
      <h3 style="color:#2F3134;margin:0 0 12px;">Customers Emailed:</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#2F3134;color:#fff;">
            <th style="padding:10px;text-align:left;">Name</th>
            <th style="padding:10px;text-align:left;">Email</th>
          </tr>
        </thead>
        <tbody>${customerList}</tbody>
      </table>
      ${results.errors.length > 0 ? `<div style="margin-top:20px;padding:12px;background:#fff3cd;border-radius:6px;"><strong>Errors:</strong><ul style="margin:8px 0 0;padding-left:20px;">${results.errors.map(e => `<li>${e}</li>`).join('')}</ul></div>` : ''}
    `;

    const reportHtml = await renderBrandedEmail(
      supabase,
      "First Session Promo Report",
      reportBody,
      undefined,
      tenant,
    );

    try {
      await resend.emails.send({
        from: `${tenant.venue_name} System <${tenant.admin_alert_email}>`,
        to: [tenant.admin_alert_email],
        subject: `First Session Email Resend Report - ${results.success}/${results.processed} sent`,
        html: reportHtml,
      });
      logStep("Admin report email sent");
    } catch (reportError) {
      logStep("Failed to send admin report", { error: String(reportError) });
    }

    return new Response(
      JSON.stringify({
        message: `Resent emails to ${results.success} of ${results.processed} customers`,
        ...results,
        success: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

function getDefaultTemplate(tenant: TenantConfig): string {
  return `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Hi {first_name}, we noticed you haven't booked your first session yet. We'd love to see you at ${tenant.venue_name}, so we've added credit to your account!
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#2F3134; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:30px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Manrope, Arial, sans-serif; font-size:14px; color:#F5F3EF; opacity:0.9;">Your Account Credit</p>
                    <p style="margin:0; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:52px; color:#B5772A;">$35.00</p>
                    <p style="margin:8px 0 0; font-family:Manrope, Arial, sans-serif; font-size:14px; color:#F5F3EF; opacity:0.9;">Enough for 1 hour off-peak!</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                This credit has been automatically added to your account and will be applied at checkout. No code needed!
              </p>
  `;
}
