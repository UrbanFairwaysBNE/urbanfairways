import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DepositNotificationRequest {
  user_id: string;
  amount: number;
  new_balance: number;
  credit_type?: 'google_review' | 'gift_card' | 'loyalty' | 'manual' | 'other';
  description?: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-DEPOSIT-NOTIFICATION] ${step}${detailsStr}`);
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const tenant = await getTenant();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id, amount, new_balance, credit_type, description }: DepositNotificationRequest = await req.json();
    logStep("Request received", { user_id, amount, new_balance });

    if (!user_id || amount === undefined || new_balance === undefined) {
      throw new Error("Missing user_id, amount, or new_balance");
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      throw new Error(`Failed to fetch profile: ${profileError?.message}`);
    }
    logStep("Profile fetched", { email: profile.email, phone: profile.phone });

    // Fetch custom email template
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", "credit_added")
      .single();
    
    if (templateError) {
      logStep("Template fetch error (using default)", { error: templateError.message });
    } else {
      logStep("Template fetched", { hasCustomHtml: !!emailTemplate?.html_content, isActive: emailTemplate?.is_active });
    }

    // Check if template is disabled - skip sending if so
    if (emailTemplate && emailTemplate.is_active === false) {
      logStep("Template is disabled, skipping email notification");
      return new Response(
        JSON.stringify({ 
          success: true, 
          email_sent: false,
          sms_sent: false,
          message: "Credit notification skipped - template disabled" 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate previous balance
    const previousBalance = new_balance - amount;

    // Template replacement tags
    const templateTags: Record<string, string> = {
      '{first_name}': profile.first_name || '',
      '{last_name}': profile.last_name || '',
      '{email}': profile.email || '',
      '{deposit_amount}': `$${amount.toFixed(2)}`,
      '{new_balance}': `$${new_balance.toFixed(2)}`,
      '{previous_balance}': `$${previousBalance.toFixed(2)}`,
    };

    // Use custom subject if available
    let subject = emailTemplate?.subject || `Credit Added to Your Account - ${tenant.venue_name}`;
    let htmlContent: string;

    if (emailTemplate?.html_content) {
      const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
      subject = replaceTemplateTags(subject, templateTags);
      htmlContent = await renderBrandedEmail(supabaseClient, "Credit Added!", bodyContent, {
        text: "Book Now",
        url: tenantHubUrl(tenant, "/booking")
      });
      logStep("Using custom email template with wrapper");
    } else {
      // Build body content based on credit type
      let creditReasonText = "";
      if (credit_type === 'google_review') {
        creditReasonText = `
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                <strong>Thank you for your Google review!</strong> 🌟
              </p>`;
      }
      
      const bodyContent = `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Hi ${profile.first_name}, great news! Credit has been added to your ${tenant.venue_name} account.
              </p>
              
              ${creditReasonText}
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #B5772A;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; text-align:center;">
                    <p style="margin:5px 0; font-size:18px; color:#2F3134;"><strong>Amount Added:</strong></p>
                    <p style="margin:5px 0; font-size:32px; color:#2F3134; font-family:Archivo, Impact, Arial Black, sans-serif;"><strong>$${amount.toFixed(2)}</strong></p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;">
                    <p style="margin:5px 0; font-size:16px; color:#2F3134;"><strong>New Balance:</strong> $${new_balance.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                You can use your credit balance when booking a bay - just select "Use Balance" at checkout!
              </p>
      `;
      
      htmlContent = await renderBrandedEmail(supabaseClient, "Credit Added!", bodyContent, {
        text: "Book Now",
        url: tenantHubUrl(tenant, "/booking")
      });
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [profile.email],
      subject: subject,
      html: htmlContent,
    });

    logStep("Email sent successfully", { emailResponse });

    // Credit notifications are email only (no SMS per business rules)
    logStep("Credit notification - email only, skipping SMS");

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: true,
        sms_sent: false,
        message: "Deposit notification sent successfully" 
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