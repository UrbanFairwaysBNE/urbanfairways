import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  gift_card_id: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const tenant = await getTenant();


  try {
    const SIGNUP_URL = tenantHubUrl(tenant, "/");
    const { gift_card_id } = (await req.json()) as Body;
    if (!gift_card_id) throw new Error("gift_card_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: card, error: cardErr } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("id", gift_card_id)
      .single();

    if (cardErr || !card) throw new Error("Gift card not found");

    if (card.status === "redeemed" || card.status === "cancelled") {
      return new Response(JSON.stringify({ success: true, skipped: card.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Number(card.amount);
    const recipientEmail = String(card.recipient_email).toLowerCase().trim();
    const recipientName = card.recipient_name || "there";

    const subject = `You've been issued a $${amount.toFixed(2)} ${tenant.venue_name} gift card`;
    const heading = "You've Been Issued a Gift Card";

    const amountBlock = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#2F3134; border-radius:12px; margin:18px 0;">
        <tr>
          <td style="padding:30px; text-align:center;">
            <p style="margin:0 0 8px; font-family:Manrope, Arial, sans-serif; font-size:14px; color:#F5F3EF; opacity:0.9; letter-spacing:1px; text-transform:uppercase;">Gift Card Value</p>
            <p style="margin:0; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:56px; color:#5F6F52;">$${amount.toFixed(2)}</p>
          </td>
        </tr>
      </table>
    `;

    const intro = `<p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">Hi ${escapeHtml(recipientName)}, ${tenant.venue_name} has issued you a gift card to enjoy a session with us.</p>`;

    const footer = `<p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#2F3134; text-align:center;">Create your free account using <strong>this email address</strong> and your credit applies automatically at checkout.</p>`;

    const html = await renderBrandedEmail(supabase, heading, intro + amountBlock + footer, {
      text: "Activate Your Gift",
      url: SIGNUP_URL,
    });

    const r = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [recipientEmail],
      subject,
      html,
    });
    console.log(`[issue-admin-gift-card] Email sent:`, r);

    await supabase
      .from("gift_cards")
      .update({ status: "pending", sent_at: new Date().toISOString() })
      .eq("id", card.id);

    return new Response(JSON.stringify({ success: true, email_id: r.data?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[issue-admin-gift-card] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
