import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { tenantHubUrl } from "../_shared/tenant.ts";
import { getTenant } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  gift_card_id: string;
  // Legacy params (still accepted, but we read the row directly)
  recipient_email?: string;
  amount?: number;
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

    // Load the full card record
    const { data: card, error: cardErr } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("id", gift_card_id)
      .single();

    if (cardErr || !card) throw new Error("Gift card not found");

    if (card.status === "redeemed" || card.status === "cancelled") {
      console.log(`[issue-gift-card] Card ${card.id} already ${card.status}, skipping`);
      return new Response(JSON.stringify({ success: true, skipped: card.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Number(card.amount);
    const recipientEmail = String(card.recipient_email).toLowerCase().trim();
    const recipientName = card.recipient_name || "there";
    const senderName = card.sender_name || "A friend";
    const senderEmail = card.sender_email;
    const personalMessage = card.personal_message;
    const deliveryMethod = card.delivery_method || "email_recipient";
    const redemptionCode = card.redemption_code;

    console.log(
      `[issue-gift-card] Issuing card ${card.id} amount=$${amount} method=${deliveryMethod} recipient=${recipientEmail}`
    );

    // Check if recipient already has an account
    const { data: recipientProfile } = await supabase
      .from("profiles")
      .select("user_id, first_name, deposit_balance")
      .eq("email", recipientEmail)
      .maybeSingle();

    const recipientHasAccount = !!recipientProfile?.user_id;

    // If recipient has an account AND delivery includes them → auto-apply credit
    let autoApplied = false;
    if (recipientHasAccount && deliveryMethod !== "print_to_sender") {
      const before = Number(recipientProfile.deposit_balance ?? 0);
      const after = before + amount;

      await supabase
        .from("profiles")
        .update({ deposit_balance: after })
        .eq("user_id", recipientProfile.user_id);

      await supabase.from("deposit_transactions").insert({
        user_id: recipientProfile.user_id,
        amount,
        balance_before: before,
        balance_after: after,
        transaction_type: "gift_card",
        description: `Gift card from ${senderName}`,
        related_gift_card_id: card.id,
      });

      await supabase
        .from("gift_cards")
        .update({
          status: "redeemed",
          redeemed_at: new Date().toISOString(),
          redeemed_by_user_id: recipientProfile.user_id,
          sent_at: new Date().toISOString(),
        })
        .eq("id", card.id);

      autoApplied = true;
      console.log(
        `[issue-gift-card] Auto-applied $${amount} to existing user ${recipientProfile.user_id}`
      );
    }

    const results: any[] = [];

    const messageBlock = personalMessage
      ? personalMessageBlock(personalMessage, senderName)
      : `<p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">From <strong>${escapeHtml(senderName)}</strong></p>`;

    const tags: Record<string, string> = {
      "{recipient_name}": escapeHtml(recipientName),
      "{sender_name}": escapeHtml(senderName),
      "{amount}": `$${amount.toFixed(2)}`,
      "{redemption_code}": escapeHtml(redemptionCode || ""),
      "{personal_message}": personalMessage ? escapeHtml(personalMessage) : "",
      "{personal_message_block}": messageBlock,
      "{venue_name}": escapeHtml(tenant.venue_name),
      "{signup_url}": SIGNUP_URL,
    };

    // ── Email to RECIPIENT ──
    if (deliveryMethod === "email_recipient" || deliveryMethod === "both") {
      const templateKey = autoApplied ? "gift_card_recipient_applied" : "gift_card_recipient_signup";
      const tpl = await loadGiftTemplate(supabase, templateKey, tags);

      if (tpl && !tpl.active) {
        console.log(`[issue-gift-card] Template ${templateKey} disabled, skipping recipient email`);
        results.push({ to: "recipient", skipped: "template_disabled" });
      } else {
        const subject = tpl?.subject ||
          (autoApplied
            ? `${senderName} just gifted you $${amount.toFixed(2)} of ${tenant.venue_name} credit!`
            : `${senderName} sent you a $${amount.toFixed(2)} ${tenant.venue_name} gift!`);

        const heading = "You've Been Gifted!";

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

        const intro = autoApplied
          ? `<p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">Hi ${escapeHtml(recipientName)}, great news — <strong>${escapeHtml(senderName)}</strong> has gifted you ${tenant.venue_name} credit, and we've already added it to your account.</p>`
          : `<p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">Hi ${escapeHtml(recipientName)}, <strong>${escapeHtml(senderName)}</strong> wants you to enjoy a session at ${tenant.venue_name} on them.</p>`;

        const closing = autoApplied
          ? `<p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#2F3134; text-align:center;">Book a bay and your credit will apply automatically at checkout.</p>`
          : `<p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#2F3134; text-align:center;">Create your free account using <strong>this email address</strong> and your credit applies automatically.</p>`;

        const body = tpl?.body ?? (intro + messageBlock + amountBlock + closing);

        const html = await renderBrandedEmail(supabase, heading, body, {
          text: autoApplied ? "Book a Bay" : "Activate Your Gift",
          url: autoApplied ? tenantHubUrl(tenant, "/booking") : SIGNUP_URL,
        });

        try {
          const r = await resend.emails.send({
            from: `${tenant.venue_name} <${tenant.sender_email}>`,
            to: [recipientEmail],
            subject,
            html,
          });
          console.log(`[issue-gift-card] Recipient email sent:`, r);
          results.push({ to: "recipient", email_id: r.data?.id });
        } catch (e) {
          console.error(`[issue-gift-card] Recipient email failed:`, e);
          results.push({ to: "recipient", error: String(e) });
        }
      }
    }


    // ── Printable email to SENDER ──
    if ((deliveryMethod === "print_to_sender" || deliveryMethod === "both") && senderEmail) {
      const printTpl = await loadGiftTemplate(supabase, "gift_card_printable", tags);
      if (printTpl && !printTpl.active) {
        console.log("[issue-gift-card] Printable template disabled, skipping sender email");
        results.push({ to: "sender_printable", skipped: "template_disabled" });
      } else {
      const subject = printTpl?.subject ||
        `Your printable gift card for ${recipientName} — $${amount.toFixed(2)}`;

      const printableCard = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F3EF; border:3px dashed #2F3134; border-radius:18px;">
                <tr>
                  <td style="padding:34px 28px; text-align:center;">
                    <p style="margin:0 0 6px; font-family:Manrope, Arial, sans-serif; font-size:13px; color:#2F3134; letter-spacing:2px; text-transform:uppercase; opacity:0.8;">${escapeHtml(tenant.venue_name)} Gift Card</p>
                    <p style="margin:0 0 18px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:64px; line-height:1; color:#5F6F52;">$${amount.toFixed(2)}</p>
                    <p style="margin:0 0 6px; font-family:Manrope, Arial, sans-serif; font-size:14px; color:#2F3134; opacity:0.75;">To</p>
                    <p style="margin:0 0 18px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:28px; color:#2F3134;">${escapeHtml(recipientName)}</p>
                    ${personalMessage ? `<p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.5; color:#2F3134; font-style:italic; padding:0 12px;">"${escapeHtml(personalMessage)}"</p>` : ""}
                    <p style="margin:0 0 4px; font-family:Manrope, Arial, sans-serif; font-size:13px; color:#2F3134; opacity:0.75;">From</p>
                    <p style="margin:0 0 22px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:22px; color:#2F3134;">${escapeHtml(senderName)}</p>
                    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="background-color:#2F3134; border-radius:10px;">
                      <tr>
                        <td style="padding:12px 18px; text-align:center;">
                          <div style="font-family:Manrope, Arial, sans-serif; font-size:11px; color:#F5F3EF; letter-spacing:1px; text-transform:uppercase; opacity:0.85;">Redemption Code</div>
                          <div style="font-family:'Courier New', monospace; font-size:22px; font-weight:bold; color:#F5F3EF; letter-spacing:2px; margin-top:4px;">${escapeHtml(redemptionCode || "")}</div>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0; font-family:Manrope, Arial, sans-serif; font-size:11px; line-height:1.5; color:#2F3134; opacity:0.8;">Create a free account at <strong>${tenant.hub_domain}</strong><br/>then enter this code under <strong>My Account → Redeem Gift Card</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;

      const fallbackBody = `
        <p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">Your gift card is ready! Print this email (or just the card below) and give it to <strong>${escapeHtml(recipientName)}</strong>.</p>
        ${printableCard}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:22px 0 0; border:1px solid rgba(47,49,52,0.15);">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; color:#2F3134; text-align:center; letter-spacing:0.5px;">How ${escapeHtml(recipientName)} Redeems Their Gift</p>
              <ol style="margin:0; padding-left:22px; font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.7; color:#2F3134;">
                <li>Head to <a href="${tenantHubUrl(tenant, "/")}" style="color:#5F6F52; text-decoration:underline;"><strong>${tenant.hub_domain}</strong></a> and create a free account (or sign in).</li>
                <li>Go to <strong>My Account</strong> and find the <strong>"Redeem Gift Card"</strong> section.</li>
                <li>Enter the redemption code above — credit applies to their account instantly.</li>
                <li>Book a bay and the credit is automatically used at checkout.</li>
              </ol>
            </td>
          </tr>
        </table>
      `;

      const body = printTpl?.body ?? fallbackBody;

      const html = await renderBrandedEmail(supabase, "Your Printable Gift Card", body);


      try {
        const r = await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [senderEmail],
          subject,
          html,
        });
        console.log(`[issue-gift-card] Sender printable email sent:`, r);
        results.push({ to: "sender_printable", email_id: r.data?.id });
      } catch (e) {
        console.error(`[issue-gift-card] Sender printable email failed:`, e);
        results.push({ to: "sender_printable", error: String(e) });
      }
      }
    }

    // If not auto-applied, mark status as pending (i.e. issued, awaiting redemption)
    if (!autoApplied) {
      await supabase
        .from("gift_cards")
        .update({ status: "pending", sent_at: new Date().toISOString() })
        .eq("id", card.id);
    }

    return new Response(
      JSON.stringify({ success: true, autoApplied, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[issue-gift-card] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

