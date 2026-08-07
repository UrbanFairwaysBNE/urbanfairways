import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantBookingUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) =>
  console.log(`[SEND-CORPORATE-STAFF-INVITE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const applyTags = (html: string, tags: Record<string, string>): string => {
  let out = html;
  for (const [tag, value] of Object.entries(tags)) out = out.replaceAll(tag, value);
  return out;
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) throw new Error("Not authenticated");

    const { staff_email } = (await req.json()) as { staff_email: string };
    if (!staff_email) throw new Error("staff_email required");
    const to = staff_email.trim().toLowerCase();

    // Only the owner of the corporate account may invite staff
    const { data: account } = await supabase
      .from("corporate_accounts")
      .select("id, company_name, owner_user_id")
      .eq("owner_user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!account) throw new Error("Not authorised to invite staff");

    const { data: staffRow } = await supabase
      .from("corporate_staff")
      .select("monthly_hour_cap")
      .eq("corporate_id", account.id)
      .eq("email", to)
      .maybeSingle();

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name")
      .ilike("email", to)
      .maybeSingle();

    const tenant = await getTenant();
    const bookingUrl = tenantBookingUrl(tenant, "/app");

    const cap = staffRow?.monthly_hour_cap;
    const capLine = cap
      ? `You can use up to <strong>${cap} hours</strong> per month from the company balance.`
      : "You can book using the company's shared prepaid hours.";

    const tags: Record<string, string> = {
      "{first_name}": profile?.first_name || "there",
      "{email}": to,
      "{company_name}": account.company_name || "your company",
      "{owner_name}": [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(" "),
      "{monthly_cap}": cap ? String(cap) : "",
      "{cap_line}": capLine,
    };

    const { data: tpl } = await supabase
      .from("email_templates")
      .select("subject, html_content, is_active")
      .eq("template_key", "corporate_staff_invite")
      .eq("is_active", true)
      .maybeSingle();

    const subject = applyTags(
      tpl?.subject || `You've been added to ${account.company_name}'s ${tenant.venue_name} account`,
      tags,
    );

    const body = tpl?.html_content
      ? applyTags(tpl.html_content, tags)
      : `
        <p>Hi ${tags["{first_name}"]},</p>
        <p><strong>${tags["{company_name}"]}</strong> has added you to their ${tenant.venue_name} company account.</p>
        <p>${capLine}</p>
        <p>Create an account (or sign in) using <strong>${to}</strong> and your access is applied automatically at checkout.</p>
      `;

    const html = await renderBrandedEmail(supabase, "You've been added to a company account", body, {
      text: "Book a bay",
      url: bookingUrl,
    }, tenant);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [to],
      subject,
      html,
    });

    log("Sent", { to, company: account.company_name });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
