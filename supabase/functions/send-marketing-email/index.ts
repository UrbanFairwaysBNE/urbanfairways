import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantHubUrl, tenantBookingUrl, TenantConfig } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { unsubscribeToken, unsubscribeUrl as buildPublicUnsubscribeUrl, isMarketingSuppressed } from "../_shared/marketing-unsubscribe.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  email: string;
  first_name: string;
  last_name: string;
}

// Simple token generator for unsubscribe URL verification
async function generateUnsubscribeToken(email: string): Promise<string> {
  return unsubscribeToken(email, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}

function buildUnsubscribeUrl(email: string, token: string, tenant: TenantConfig): string {
  return buildPublicUnsubscribeUrl(tenant.booking_domain, email, token);
}

interface MarketingEmailRequest {
  campaign_id: string;
  subject: string;
  html_content: string;
  recipients: Recipient[];
}

// Replace template tags with actual values
function replaceTemplateTags(html: string, recipient: Recipient, resetLink?: string): string {
  let result = html
    .replace(/{first_name}/g, recipient.first_name || "there")
    .replace(/{last_name}/g, recipient.last_name || "")
    .replace(/{email}/g, recipient.email || "");
  
  // Replace reset_link if provided
  if (resetLink) {
    result = result.replace(/{reset_link}/g, resetLink);
  }
  
  return result;
}

// Generate password reset link for a user
async function generateResetLink(supabaseAdmin: any, email: string, tenant: TenantConfig): Promise<string | null> {
  try {
    const rawUrl = Deno.env.get("SITE_URL") || tenantHubUrl(tenant);
    const siteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, "") : `https://${rawUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (linkError) {
      console.error(`Error generating reset link for ${email}:`, linkError.message);
      return null;
    }

    return linkData.properties.action_link;
  } catch (error) {
    console.error(`Exception generating reset link for ${email}:`, error);
    return null;
  }
}

// Background task to send all emails
async function sendEmailsInBackground(
  campaign_id: string,
  subject: string,
  html_content: string,
  recipients: Recipient[],
  tenant: TenantConfig
) {
  console.log(`[BACKGROUND] Starting email send for campaign ${campaign_id} to ${recipients.length} recipients`);
  
  // Check if the template contains {reset_link} - if so, we need to generate reset links
  const needsResetLink = html_content.includes('{reset_link}');
  console.log(`[BACKGROUND] Template needs reset links: ${needsResetLink}`);

  // Initialize Supabase admin client if we need to generate reset links
  let supabaseAdmin: any = null;
  if (needsResetLink) {
    supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
  }

  // Also create admin client to update campaign status
  const supabaseForUpdate = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let successCount = 0;
  let failCount = 0;

  // Process in larger batches for efficiency (Resend batch API supports up to 100 emails)
  const batchSize = 50;
  
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    console.log(`[BACKGROUND] Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(recipients.length / batchSize)}`);
    
    // Prepare all emails in this batch
    const emailPromises = batch.map(async (recipient) => {
      try {
        if (await isMarketingSuppressed(supabaseForUpdate, recipient.email)) return null;
        // Generate reset link if needed
        let resetLink: string | undefined;
        if (needsResetLink && supabaseAdmin) {
          const link = await generateResetLink(supabaseAdmin, recipient.email, tenant);
          if (link) {
            resetLink = link;
          } else {
            // If we can't generate a reset link, use a fallback URL with forgot=true
            resetLink = tenantHubUrl(tenant, "/?forgot=true");
            console.warn(`[BACKGROUND] Using fallback URL for ${recipient.email}`);
          }
        }

        const personalizedContent = replaceTemplateTags(html_content, recipient, resetLink);
        const personalizedSubject = replaceTemplateTags(subject, recipient);
        
        // Generate unsubscribe URL for this recipient
        const unsubscribeToken = await generateUnsubscribeToken(recipient.email);
        const unsubscribeUrl = buildUnsubscribeUrl(recipient.email, unsubscribeToken, tenant);
        
        // Wrap the marketing content in branded template
        const bodyContent = `
            <div style="font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134;">
              ${personalizedContent}
            </div>
        `;
        
        const brandedHtml = await renderBrandedEmail(
          supabaseForUpdate,
          personalizedSubject,
          bodyContent,
          undefined,
          tenant,
          unsubscribeUrl,
        );

        return {
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [recipient.email],
          subject: personalizedSubject,
          html: brandedHtml,
          headers: {
            "List-Unsubscribe": `<${Deno.env.get("SUPABASE_URL")}/functions/v1/marketing-unsubscribe?${new URL(unsubscribeUrl).searchParams.toString()}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
      } catch (error) {
        console.error(`[BACKGROUND] Error preparing email for ${recipient.email}:`, error);
        return null;
      }
    });

    const preparedEmails = (await Promise.all(emailPromises)).filter(e => e !== null);
    
    // Send each email individually (Resend batch API requires different format)
    for (const emailData of preparedEmails) {
      try {
        if (await isMarketingSuppressed(supabaseForUpdate, emailData.to[0])) continue;
        const { error } = await resend.emails.send(emailData);
        if (error) throw error;
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`[BACKGROUND] Failed to send to ${emailData.to}:`, error);
      }
    }
    
    console.log(`[BACKGROUND] Batch complete. Progress: ${successCount + failCount}/${recipients.length}`);
    
    // Small delay between batches to avoid rate limits
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[BACKGROUND] Campaign ${campaign_id} completed. Success: ${successCount}, Failed: ${failCount}`);

  // Update campaign status in database
  try {
    await supabaseForUpdate
      .from("marketing_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: successCount,
      })
      .eq("id", campaign_id);
    console.log(`[BACKGROUND] Campaign status updated in database`);
  } catch (error) {
    console.error(`[BACKGROUND] Failed to update campaign status:`, error);
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const { campaign_id, subject, html_content, recipients }: MarketingEmailRequest = await req.json();

    console.log(`[SEND-MARKETING-EMAIL] Starting campaign: ${campaign_id}`);
    console.log(`[SEND-MARKETING-EMAIL] Recipients count: ${recipients.length}`);

    // Use EdgeRuntime.waitUntil to process emails in background
    // This allows us to return immediately while emails are sent
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendEmailsInBackground(campaign_id, subject, html_content, recipients, tenant));
      
      console.log(`[SEND-MARKETING-EMAIL] Background task started, returning immediately`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Sending ${recipients.length} emails in background`,
          queued: recipients.length
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } else {
      // Fallback for environments without EdgeRuntime.waitUntil
      console.log(`[SEND-MARKETING-EMAIL] EdgeRuntime.waitUntil not available, processing synchronously`);
      await sendEmailsInBackground(campaign_id, subject, html_content, recipients, tenant);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sent: recipients.length
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  } catch (error: any) {
    console.error("[SEND-MARKETING-EMAIL] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

Deno.serve(handler);
