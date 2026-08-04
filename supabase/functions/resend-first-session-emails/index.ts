import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

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
        let htmlContent = template?.html_content || getDefaultTemplate();

        subject = replaceTemplateTags(subject, templateTags);
        htmlContent = replaceTemplateTags(htmlContent, templateTags);

        const emailResponse = await resend.emails.send({
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [user.email],
          subject,
          html: htmlContent,
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

    const reportHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>First Session Email Resend Report</title></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#1F4C25;color:#fff;padding:20px;text-align:center;">
      <h1 style="margin:0;font-size:24px;">First Session Email Resend Report</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#333;font-size:16px;margin:0 0 16px;">Manual resend of First Session Free emails (fixing wrong sender address issue).</p>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;"><strong>Total Processed:</strong> ${results.processed}</p>
        <p style="margin:0 0 8px;"><strong>Successful:</strong> ${results.success}</p>
        <p style="margin:0;"><strong>Failed:</strong> ${results.failed}</p>
      </div>
      <h3 style="color:#1F4C25;margin:0 0 12px;">Customers Emailed:</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#1F4C25;color:#fff;">
            <th style="padding:10px;text-align:left;">Name</th>
            <th style="padding:10px;text-align:left;">Email</th>
          </tr>
        </thead>
        <tbody>${customerList}</tbody>
      </table>
      ${results.errors.length > 0 ? `<div style="margin-top:20px;padding:12px;background:#fff3cd;border-radius:6px;"><strong>Errors:</strong><ul style="margin:8px 0 0;padding-left:20px;">${results.errors.map(e => `<li>${e}</li>`).join('')}</ul></div>` : ''}
    </div>
    <div style="background:#f8f9fa;padding:16px;text-align:center;color:#666;font-size:12px;">
      Report generated at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST
    </div>
  </div>
</body>
</html>`;

    try {
      await resend.emails.send({
        from: "Birdies System <admin@birdiesbayside.com.au>",
        to: ["admin@birdiesbayside.com.au"],
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

function getDefaultTemplate(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Free Hour</title>
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
              <h1 style="margin:0 0 14px; font-family:Arial, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">A Gift From Us To You!</h1>
              <p style="margin:0 0 18px; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi {first_name}, we noticed you haven't booked your first session yet. We'd love to see you at Birdies, so we've added credit to your account!
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:30px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Your Account Credit</p>
                    <p style="margin:0; font-family:Arial, sans-serif; font-size:52px; font-weight:bold; color:#EC622D;">$35.00</p>
                    <p style="margin:8px 0 0; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Enough for 1 hour off-peak!</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                This credit has been automatically added to your account and will be applied at checkout. No code needed!
              </p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="https://hub.birdiesbayside.com.au/booking" style="display:inline-block; padding:14px 28px; font-family:Arial, sans-serif; font-size:18px; font-weight:bold; color:#FFFFFF; text-decoration:none;">Book Your Free Session</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; color:#FFF5E4; text-align:center; opacity:0.85;">
                Birdies Bayside | <a href="mailto:info@birdiesbayside.com.au" style="color:#EC622D; text-decoration:none;">info@birdiesbayside.com.au</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
