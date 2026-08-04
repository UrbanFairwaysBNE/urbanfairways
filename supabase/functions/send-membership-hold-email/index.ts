import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MembershipHoldRequest {
  user_id: string;
  email: string;
  first_name: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-MEMBERSHIP-HOLD-EMAIL] ${step}${detailsStr}`);
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

    const { user_id, email, first_name }: MembershipHoldRequest = await req.json();
    logStep("Request received", { user_id, email, first_name });

    if (!email || !first_name) {
      throw new Error("Missing email or first_name");
    }

    // Fetch custom email template
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", "membership_on_hold")
      .eq("is_active", true)
      .single();
    
    if (templateError) {
      logStep("Template fetch error (using default)", { error: templateError.message });
    } else {
      logStep("Template fetched", { hasCustomHtml: !!emailTemplate?.html_content });
    }

    // Template replacement tags
    const templateTags: Record<string, string> = {
      '{first_name}': first_name || '',
      '{email}': email || '',
    };

    // Use custom subject if available
    let subject = emailTemplate?.subject || `Your ${tenant.venue_name} Membership is On Hold`;
    let bodyContent: string;

    if (emailTemplate?.html_content) {
      bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
      subject = replaceTemplateTags(subject, templateTags);
      logStep("Using custom email template body with shared wrapper");
    } else {
      bodyContent = `
        <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">Hi ${first_name}, your membership at ${tenant.venue_name} has been placed on hold.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEF3C7; border-radius:12px; margin:18px 0; border-left:4px solid #D97706;">
          <tr><td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#92400E;">
            <h3 style="margin:0 0 10px 0; font-family:Archivo, Impact, Arial Black, sans-serif; color:#92400E;">What This Means</h3>
            <ul style="margin:0; padding-left:20px;">
              <li style="margin-bottom:8px;">You will not be able to book bays while your membership is on hold</li>
              <li style="margin-bottom:8px;">Your membership tier has been preserved</li>
              <li style="margin-bottom:8px;">Billing has been paused during this period</li>
            </ul>
          </td></tr>
        </table>
        <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">If you have any questions or would like to reactivate your membership, please contact us.</p>
      `;
      logStep("Using default email template body");
    }

    const htmlContent = await renderBrandedEmail(supabaseClient, "Membership On Hold", bodyContent);

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [email],
      subject: subject,
      html: htmlContent,
    });

    logStep("Email sent successfully", { emailResponse });

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: true,
        message: "Membership hold email sent successfully" 
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
