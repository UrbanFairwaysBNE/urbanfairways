import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantHubUrl, TenantConfig } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  force?: boolean;
  threshold?: number;
  dry_run?: boolean;
}

interface EligibleUser {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  deposit_balance: number;
}

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FIRST-SESSION-PROMO] ${step}${detailsStr}`);
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
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for options
    let options: RequestBody = {};
    try {
      const body = await req.text();
      if (body) {
        options = JSON.parse(body);
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    const threshold = options.threshold ?? 10;
    const force = options.force ?? false;
    const dryRun = options.dry_run ?? false;

    logStep("Options", { threshold, force, dryRun });

    // Fetch eligible users:
    // - No bookings (excluding cancelled)
    // - Marketing opt-out = false
    // - first_session_promo_sent IS NULL
    // - Created more than 24 hours ago
    // - Exclude bulk import batch (created on 2025-01-18 between 07:00 and 07:40 UTC)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // First get all potential users, then filter in code for bulk import
    const { data: allEligibleUsers, error: fetchError } = await supabase
      .from("profiles")
      .select("id, user_id, email, first_name, last_name, deposit_balance, created_at")
      .is("first_session_promo_sent", null)
      .eq("marketing_opt_out", false)
      .lt("created_at", twentyFourHoursAgo);

    if (fetchError) {
      throw new Error(`Failed to fetch profiles: ${String(fetchError)}`);
    }

    // Filter out bulk import users (created 2026-01-18 between 07:00-08:00 UTC)
    const bulkImportStart = new Date("2026-01-18T07:00:00Z").getTime();
    const bulkImportEnd = new Date("2026-01-18T08:00:00Z").getTime();
    
    const eligibleUsers = (allEligibleUsers || []).filter(user => {
      const createdAt = new Date(user.created_at).getTime();
      // Exclude if created during bulk import window
      return createdAt < bulkImportStart || createdAt > bulkImportEnd;
    });

    logStep("After bulk import filter", { count: eligibleUsers.length });

    // Get all user_ids who have non-cancelled bookings (batch query)
    const userIds = eligibleUsers.map(u => u.user_id);
    
    // Query users who have bookings in batches of 100 to avoid query limits
    const usersWithBookings = new Set<string>();
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batchUserIds = userIds.slice(i, i + BATCH_SIZE);
      const { data: bookings, error: bookingError } = await supabase
        .from("bookings")
        .select("user_id")
        .in("user_id", batchUserIds)
        .neq("status", "cancelled");
      
      if (bookingError) {
        logStep("Error fetching bookings batch", { error: bookingError.message });
        continue;
      }
      
      bookings?.forEach(b => usersWithBookings.add(b.user_id));
    }

    // Filter to only users without bookings
    const usersWithoutBookings: EligibleUser[] = eligibleUsers.filter(
      user => !usersWithBookings.has(user.user_id)
    );

    logStep("Users without bookings", { count: usersWithoutBookings.length });

    const finalEligibleUsers = usersWithoutBookings;

    logStep("Final eligible users", { count: finalEligibleUsers.length });

    // Check threshold
    if (!force && finalEligibleUsers.length < threshold) {
      logStep("Below threshold, skipping", { eligible: finalEligibleUsers.length, threshold });
      return new Response(
        JSON.stringify({
          success: true,
          message: `Below threshold (${finalEligibleUsers.length}/${threshold}). No action taken.`,
          eligible_count: finalEligibleUsers.length,
          threshold,
          processed: 0,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Dry run - just return the list
    if (dryRun) {
      logStep("Dry run mode - returning eligible users");
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          eligible_count: finalEligibleUsers.length,
          eligible_users: finalEligibleUsers.map(u => ({
            email: u.email,
            first_name: u.first_name,
            last_name: u.last_name,
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Fetch email template - try marketing_templates first (editable in Marketing section),
    // then fall back to email_templates for backwards compatibility
    let template: { subject: string; html_content: string } | null = null;
    
    const { data: marketingTemplate, error: marketingError } = await supabase
      .from("marketing_templates")
      .select("subject, html_content")
      .eq("name", "First Session Free")
      .eq("is_active", true)
      .maybeSingle();

    if (marketingError) {
      logStep("Marketing template fetch error", { error: marketingError.message });
    }

    if (marketingTemplate) {
      template = marketingTemplate;
      logStep("Using marketing template");
    } else {
      // Fallback to email_templates
      const { data: emailTemplate, error: emailError } = await supabase
        .from("email_templates")
        .select("subject, html_content")
        .eq("template_key", "first_session_promo")
        .eq("is_active", true)
        .maybeSingle();

      if (emailError) {
        logStep("Email template fetch error", { error: emailError.message });
      }
      template = emailTemplate;
    }

    // Process users
    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    const CREDIT_AMOUNT = 35;
    const BATCH_DELAY_MS = 600;

    for (let i = 0; i < finalEligibleUsers.length; i++) {
      const user = finalEligibleUsers[i];
      
      try {
        logStep(`Processing user ${i + 1}/${finalEligibleUsers.length}`, { email: user.email });

        // 1. Update deposit_balance and set promo timestamp
        const currentBalance = user.deposit_balance || 0;
        const newBalance = currentBalance + CREDIT_AMOUNT;
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            deposit_balance: newBalance,
            first_session_promo_sent: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updateError) {
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }

        // 2. Log deposit transaction for audit trail
        const { error: txError } = await supabase
          .from("deposit_transactions")
          .insert({
            user_id: user.user_id,
            amount: CREDIT_AMOUNT,
            balance_before: currentBalance,
            balance_after: newBalance,
            transaction_type: "promo_credit",
            description: "First Session Free - $35 credit",
          });

        if (txError) {
          logStep("Warning: Failed to log deposit transaction", { email: user.email, error: txError.message });
        }

        // 2. Send email
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
        if (i < finalEligibleUsers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Error processing user", { email: user.email, error: errorMessage });
        results.errors.push(`Failed for ${user.email}: ${errorMessage}`);
        results.failed++;
        results.processed++;
      }
    }

    logStep("Processing complete", results);

    // Send admin report email
    if (results.processed > 0) {
      const customerList = finalEligibleUsers.map(u => 
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${u.first_name} ${u.last_name}</td><td style="padding:8px;border-bottom:1px solid #eee;">${u.email}</td></tr>`
      ).join('');

      const reportHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>First Session Promo Report</title></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#1F4C25;color:#fff;padding:20px;text-align:center;">
      <h1 style="margin:0;font-size:24px;">First Session Promo Report</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#333;font-size:16px;margin:0 0 16px;">The automated First Session Free campaign has been triggered.</p>
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;"><strong>Total Processed:</strong> ${results.processed}</p>
        <p style="margin:0 0 8px;"><strong>Successful:</strong> ${results.success}</p>
        <p style="margin:0;"><strong>Failed:</strong> ${results.failed}</p>
      </div>
      <h3 style="color:#1F4C25;margin:0 0 12px;">Customers Included:</h3>
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
          from: `${tenant.venue_name} System <${tenant.admin_alert_email}>`,
          to: [tenant.admin_alert_email],
          subject: `First Session Promo Report - ${results.processed} customers processed`,
          html: reportHtml,
        });
        logStep("Admin report email sent");
      } catch (reportError) {
        logStep("Failed to send admin report", { error: String(reportError) });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.processed} users`,
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
                Hi {first_name}, we noticed you haven't booked your first session yet. We'd love to see you at ${tenant.venue_name}, so we've added credit to your account!
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
                    <a href="${tenantHubUrl(tenant, "/booking")}" style="display:inline-block; padding:14px 28px; font-family:Arial, sans-serif; font-size:18px; font-weight:bold; color:#FFFFFF; text-decoration:none;">Book Your Free Session</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; color:#FFF5E4; text-align:center; opacity:0.85;">
                ${tenant.venue_name} | <a href="mailto:${tenant.support_email}" style="color:#EC622D; text-decoration:none;">${tenant.support_email}</a>
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
