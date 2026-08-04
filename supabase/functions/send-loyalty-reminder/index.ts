import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { getTenant, tenantHubUrl, tenantBookingUrl, tenantAddress, TenantConfig } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[LOYALTY-REMINDER] ${step}${d}`);
};

const buildEmail = (tenant: TenantConfig, heading: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>@import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");</style>
</head><body style="margin:0;padding:0;background-color:#FFF5E4;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
      <tr><td align="center" style="background-color:#1F4C25;padding:18px;border-radius:16px 16px 0 0;">
        <div style="font-family:Anton, Impact, Arial Black, sans-serif; font-size:26px; color:#FFFFFF; text-align:center; letter-spacing:0.5px;">${tenant.venue_name}</div>
      </td></tr>
      <tr><td style="background-color:#FFF5E4;padding:26px 22px;border-left:1px solid rgba(31,76,37,0.12);border-right:1px solid rgba(31,76,37,0.12);">
        <h1 style="margin:0 0 14px;font-family:Anton,Impact,Arial Black,sans-serif;font-size:34px;line-height:1.1;color:#1F4C25;text-align:center;">${heading}</h1>
        ${body}
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
          <tr><td bgcolor="#EC622D" style="border-radius:12px;">
            <a href="${tenantBookingUrl(tenant, "/booking")}" style="display:inline-block;padding:14px 24px;font-family:Anton,Impact,Arial Black,sans-serif;font-size:18px;letter-spacing:0.3px;color:#FFFFFF;text-decoration:none;">BOOK NOW</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background-color:#1F4C25;padding:22px;border-radius:0 0 16px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:14px;">
            <a href="https://www.instagram.com/${tenant.socials?.instagram || ''}" style="margin:0 8px;text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block;border:0;"/></a>
            <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px;text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block;border:0;"/></a>
          </td></tr>
          <tr><td align="center" style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.7;color:#FFFFFF;">
            <div>${tenantAddress(tenant)}</div>
            <div><a href="tel:${tenant.support_phone}" style="color:#FFFFFF;text-decoration:underline;">${tenant.support_phone}</a></div>
            <div><a href="${tenantBookingUrl(tenant)}" style="color:#FFFFFF;text-decoration:underline;">${tenant.booking_domain}</a></div>
            <div style="margin-top:10px;font-size:12px;opacity:0.75;">© ${tenant.venue_name}</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

const bodyFor = (tenant: TenantConfig, firstName: string, balance: number, isFinal: boolean) => {
  const intro = isFinal
    ? `Hey ${firstName || "there"}, last reminder — you've still got loyalty credit sitting on your ${tenant.venue_name} account that you haven't used yet.`
    : `Hey ${firstName || "there"}, just a heads up — you earned loyalty credit a couple of weeks ago and still haven't used it. Don't let it go to waste!`;

  const outro = isFinal
    ? `This is the final nudge from us. Book a session and we'll see you in a bay soon. 🏌️`
    : `Pop in for a hit — your credit is ready to roll into your next booking.`;

  return `
    <p style="margin:0 0 18px;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1F4C25;text-align:center;">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25;border-radius:12px;margin:18px 0;">
      <tr><td style="padding:30px;text-align:center;">
        <p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#FFF5E4;opacity:0.9;">Your Credit Balance</p>
        <p style="margin:0;font-family:Anton,Impact,Arial Black,sans-serif;font-size:52px;color:#EC622D;">$${balance.toFixed(2)}</p>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-family:Inter,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1F4C25;text-align:center;">${outro}</p>
  `;
};

interface Candidate {
  id: string;
  user_id: string;
  credit_amount: number;
  created_at: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const tenant = await getTenant();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const summary = { sent_14d: 0, sent_30d: 0, skipped_spent: 0, errors: 0 };

  try {
    const now = Date.now();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ---------- 14-day reminders ----------
    const { data: due14 } = await supabase
      .from("loyalty_credits_issued")
      .select("id, user_id, credit_amount, created_at")
      .is("reminder_14d_sent_at", null)
      .lte("created_at", fourteenDaysAgo)
      .gt("created_at", thirtyDaysAgo);

    logStep("14d candidates", { count: due14?.length || 0 });

    for (const c of (due14 || []) as Candidate[]) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, first_name, deposit_balance, marketing_opt_out")
          .eq("user_id", c.user_id)
          .maybeSingle();

        if (!profile?.email || profile.marketing_opt_out) continue;
        if ((profile.deposit_balance || 0) <= 0) {
          summary.skipped_spent++;
          await supabase.from("loyalty_credits_issued")
            .update({ reminder_14d_sent_at: new Date().toISOString() })
            .eq("id", c.id);
          continue;
        }

        await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [profile.email],
          subject: `You've still got $${Number(profile.deposit_balance).toFixed(2)} waiting at ${tenant.venue_name} 🎁`,
          html: buildEmail(tenant, "DON'T FORGET YOUR CREDIT", bodyFor(tenant, profile.first_name, Number(profile.deposit_balance), false)),
        });

        await supabase.from("loyalty_credits_issued")
          .update({ reminder_14d_sent_at: new Date().toISOString() })
          .eq("id", c.id);
        summary.sent_14d++;
      } catch (e: any) {
        summary.errors++;
        logStep("14d send error", { user_id: c.user_id, error: e.message });
      }
    }

    // ---------- 30-day final reminders ----------
    const { data: due30 } = await supabase
      .from("loyalty_credits_issued")
      .select("id, user_id, credit_amount, created_at")
      .is("reminder_30d_sent_at", null)
      .lte("created_at", thirtyDaysAgo);

    logStep("30d candidates", { count: due30?.length || 0 });

    for (const c of (due30 || []) as Candidate[]) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, first_name, deposit_balance, marketing_opt_out")
          .eq("user_id", c.user_id)
          .maybeSingle();

        if (!profile?.email || profile.marketing_opt_out) continue;
        if ((profile.deposit_balance || 0) <= 0) {
          summary.skipped_spent++;
          await supabase.from("loyalty_credits_issued")
            .update({ reminder_30d_sent_at: new Date().toISOString() })
            .eq("id", c.id);
          continue;
        }

        await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [profile.email],
          subject: `Last call — $${Number(profile.deposit_balance).toFixed(2)} ${tenant.venue_name} credit waiting for you`,
          html: buildEmail(tenant, "LAST REMINDER", bodyFor(tenant, profile.first_name, Number(profile.deposit_balance), true)),
        });

        await supabase.from("loyalty_credits_issued")
          .update({ reminder_30d_sent_at: new Date().toISOString() })
          .eq("id", c.id);
        summary.sent_30d++;
      } catch (e: any) {
        summary.errors++;
        logStep("30d send error", { user_id: c.user_id, error: e.message });
      }
    }

    logStep("Done", summary);
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    logStep("FATAL", { error: error.message });
    return new Response(JSON.stringify({ error: error.message, ...summary }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
