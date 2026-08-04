import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl, tenantBookingUrl } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-WELCOME-EMAIL] ${step}${detailsStr}`);
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

    const { user_id, email, first_name, last_name }: WelcomeEmailRequest = await req.json();
    logStep("Request received", { user_id, email, first_name });

    if (!email || !first_name) {
      throw new Error("Missing email or first_name");
    }

    // Fetch custom email template
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", "welcome")
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
      '{last_name}': last_name || '',
      '{email}': email || '',
    };

    // Use custom subject if available
    let subject = emailTemplate?.subject || `Welcome to ${tenant.venue_name}!`;
    let htmlContent: string;

    if (emailTemplate?.html_content) {
      const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
      subject = replaceTemplateTags(subject, templateTags);
      htmlContent = await renderBrandedEmail(supabaseClient, `Welcome to ${tenant.venue_name}!`, bodyContent, {
        text: "Book Your First Session",
        url: tenantBookingUrl(tenant, "/booking")
      });
      logStep("Using custom email template with wrapper");
    } else {
      const bodyContent = `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Hi ${first_name}, welcome to ${tenant.venue_name}! We're excited to have you join our community of golf enthusiasts.
              </p>
              
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Your account has been created and you're ready to start booking sessions on our state-of-the-art golf simulators.
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #B5772A;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134;">
                    <h3 style="margin:0 0 10px 0; font-family:Archivo, Impact, Arial Black, sans-serif; color:#2F3134;">What's Next?</h3>
                    <ul style="margin:0; padding-left:20px;">
                      <li style="margin-bottom:8px;">Book your first session</li>
                      <li style="margin-bottom:8px;">Explore our membership options for discounted rates</li>
                      <li style="margin-bottom:8px;">Join the ${tenant.venue_name} League to compete with other members</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                See you on the course!<br/>
                <strong>The ${tenant.venue_name} Team</strong>
              </p>
      `;
      
      htmlContent = await renderBrandedEmail(supabaseClient, `Welcome to ${tenant.venue_name}!`, bodyContent, {
        text: "Book Your First Session",
        url: tenantBookingUrl(tenant, "/booking")
      });
    }

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
        message: "Welcome email sent successfully" 
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