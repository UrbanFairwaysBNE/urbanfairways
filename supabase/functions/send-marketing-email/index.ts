import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantHubUrl, tenantBookingUrl, tenantAddress, TenantConfig } from "../_shared/tenant.ts";

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
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase() + "venue-unsubscribe-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

function buildUnsubscribeUrl(email: string, token: string, tenant: TenantConfig): string {
  const rawUrl = Deno.env.get("SITE_URL") || tenantHubUrl(tenant);
  const siteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, "") : `https://${rawUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
  return `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
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

// Build branded email wrapper with unsubscribe link for marketing emails
const buildEmailTemplate = (tenant: TenantConfig, heading: string, bodyContent: string, ctaButton?: { text: string; url: string }, unsubscribeUrl?: string) => {
  const buttonHtml = ctaButton ? `
              <!-- BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#B5772A" style="border-radius:12px;">
                    <a href="${ctaButton.url}"
                       style="display:inline-block; padding:14px 24px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      ${ctaButton.text}
                    </a>
                  </td>
                </tr>
              </table>
  ` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${tenant.venue_name} Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F5F3EF;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F3EF;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!-- CONTAINER -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#2F3134; padding:18px; border-radius:16px 16px 0 0;">
              <div style="font-family:Archivo, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background-color:#F5F3EF; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">
              <h1 style="margin:0 0 14px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#2F3134; text-align:center;">
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#2F3134; padding:22px; border-radius:0 0 16px 16px;">
              <!-- SOCIAL ICONS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <!-- Instagram -->
                    <a href="https://www.instagram.com/${tenant.socials?.instagram || ''}" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <!-- Facebook -->
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <!-- CONTACT DETAILS -->
                <tr>
                  <td align="center" style="font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
                    <div>${tenantAddress(tenant)}</div>
                    <div><a href="tel:${tenant.support_phone}" style="color:#FFFFFF; text-decoration:underline;">${tenant.support_phone}</a></div>
                    <div><a href="${tenantBookingUrl(tenant)}" style="color:#FFFFFF; text-decoration:underline;">${tenant.booking_domain}</a></div>
                    <div style="margin-top:10px; font-size:12px; opacity:0.75;">© ${tenant.venue_name}</div>
                    ${unsubscribeUrl ? `<div style="margin-top:12px; font-size:11px; opacity:0.6;"><a href="${unsubscribeUrl}" style="color:#FFFFFF; text-decoration:underline;">Unsubscribe from marketing emails</a></div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- /CONTAINER -->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

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
        
        const brandedHtml = buildEmailTemplate(tenant, personalizedSubject, bodyContent, undefined, unsubscribeUrl);

        return {
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [recipient.email],
          subject: personalizedSubject,
          html: brandedHtml,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
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
        await resend.emails.send(emailData);
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

serve(handler);
