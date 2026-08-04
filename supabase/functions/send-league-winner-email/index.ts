import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const resend = new Resend(RESEND_API_KEY);


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const { userId, playerName, tournamentName, prizeAmount } = await req.json();

    if (!userId || !playerName || !tournamentName || !prizeAmount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, first_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("[LEAGUE-WINNER-EMAIL] Profile not found:", profileError);
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("subject, html_content")
      .eq("template_key", "league_weekly_winner")
      .eq("is_active", true)
      .maybeSingle();

    if (templateError || !template) {
      console.error("[LEAGUE-WINNER-EMAIL] Template not found:", templateError);
      return new Response(
        JSON.stringify({ error: "Email template not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace template variables in body content
    let bodyContent = template.html_content || "";
    bodyContent = bodyContent.replace(/\{\{first_name\}\}/g, profile.first_name || playerName);
    bodyContent = bodyContent.replace(/\{\{tournament_name\}\}/g, tournamentName);
    bodyContent = bodyContent.replace(/\{\{prize_amount\}\}/g, prizeAmount.toString());

    let subject = template.subject || "Congratulations! You Won This Week's League Prize!";
    subject = subject.replace(/\{\{tournament_name\}\}/g, tournamentName);

    // Wrap body content in branded template
    const htmlContent = await renderBrandedEmail(supabase, "🏆 Congratulations! 🏆", bodyContent, {
      text: "View My Account",
      url: tenantHubUrl(tenant, "/my-account")
    });

    if (!RESEND_API_KEY) {
      console.error("[LEAGUE-WINNER-EMAIL] RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailResult = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [profile.email],
      subject: subject,
      html: htmlContent,
    });

    console.log("[LEAGUE-WINNER-EMAIL] Email sent successfully:", emailResult);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.data?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[LEAGUE-WINNER-EMAIL] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});