import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) =>
  console.log(`[NOTIFY-FRONTLINE-SIGNUP] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const replaceTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replaceAll(tag, value);
  }
  return result;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");
    const user = userData.user;

    const { sector, tier_key, tier_name } = await req.json();
    if (!sector) throw new Error("Missing sector");

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("user_id", user.id)
      .maybeSingle();

    // Record the sector on the profile so admins can see it later
    await supabase.from("profiles").update({ verification_sector: sector }).eq("user_id", user.id);

    const { data: template } = await supabase
      .from("email_templates")
      .select("*")
      .eq("template_key", "frontline_verification")
      .maybeSingle();

    if (template && template.is_active === false) {
      log("Template disabled, skipping");
      return new Response(JSON.stringify({ success: true, email_sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signupTime = new Intl.DateTimeFormat("en-AU", {
      timeZone: tenant.timezone || "Australia/Brisbane",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    const tags: Record<string, string> = {
      "{first_name}": profile?.first_name ?? "",
      "{last_name}": profile?.last_name ?? "",
      "{email}": profile?.email ?? user.email ?? "",
      "{phone}": profile?.phone ?? "Not provided",
      "{sector}": String(sector),
      "{tier_name}": String(tier_name ?? tier_key ?? "Frontline"),
      "{signup_time}": signupTime,
    };

    const subject = replaceTags(
      template?.subject || "Frontline membership signup — {first_name} {last_name} ({sector})",
      tags,
    );

    const body = replaceTags(
      template?.html_content ||
        `<p>New Frontline membership signup: {first_name} {last_name} ({sector}) — {email} / {phone}</p>`,
      tags,
    );

    const html = await renderBrandedEmail(supabase, "Frontline Membership Signup", body);

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const result = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [tenant.admin_alert_email || tenant.support_email],
      subject,
      html,
    });
    log("Email sent", result);

    return new Response(JSON.stringify({ success: true, email_sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
