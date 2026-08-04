import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const tenant = await getTenant();

    // Verify admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    
    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      tourId, 
      month, 
      playerId, 
      playerName, 
      prizeDescription,
      emailSubject,
      emailHtml,
      notes 
    } = await req.json();

    if (!tourId || !month || !playerName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tourId, month, playerName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[APPROVE-MONTHLY] Approving ${month} winner: ${playerName} (player_id: ${playerId})`);

    // Check if profile is linked (has sgt_user_id matching playerId)
    let profileUserId: string | null = null;
    let emailSent = false;
    let recipientEmail: string | null = null;

    if (playerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, email, first_name")
        .eq("sgt_user_id", playerId)
        .maybeSingle();

      if (profile) {
        profileUserId = profile.user_id;
        recipientEmail = profile.email;

        // Send custom email if HTML provided
        if (emailHtml && RESEND_API_KEY) {
          try {
            // Replace template variables
            let bodyContent = emailHtml;
            bodyContent = bodyContent.replace(/\{\{first_name\}\}/g, profile.first_name || playerName);
            bodyContent = bodyContent.replace(/\{\{player_name\}\}/g, playerName);
            bodyContent = bodyContent.replace(/\{\{month\}\}/g, month);
            bodyContent = bodyContent.replace(/\{\{prize_description\}\}/g, prizeDescription || "");

            let subject = emailSubject || `Congratulations! You're the ${month} Monthly Winner!`;
            subject = subject.replace(/\{\{month\}\}/g, month);

            const htmlContent = await renderBrandedEmail(supabase, 
              `${month} Monthly Winner!`,
              bodyContent
            );

            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `${tenant.venue_name} <${tenant.sender_email}>`,
                to: [profile.email],
                subject: subject,
                html: htmlContent,
              }),
            });

            if (emailResponse.ok) {
              emailSent = true;
              console.log(`[APPROVE-MONTHLY] Winner email sent to ${profile.email}`);
            } else {
              console.error("[APPROVE-MONTHLY] Email send failed:", await emailResponse.text());
            }
          } catch (emailError) {
            console.error("[APPROVE-MONTHLY] Email error:", emailError);
          }
        }
      } else {
        console.log(`[APPROVE-MONTHLY] Player ${playerId} not linked to a ${tenant.venue_name} profile`);
      }
    }

    // Check if award already exists for this month
    const { data: existingAward } = await supabase
      .from("sgt_monthly_awards")
      .select("id")
      .eq("tour_id", tourId)
      .eq("month", month)
      .maybeSingle();

    if (existingAward) {
      // Update existing award
      const { error: updateError } = await supabase
        .from("sgt_monthly_awards")
        .update({
          winner_player_id: playerId || null,
          winner_player_name: playerName,
          winner_profile_user_id: profileUserId,
          prize_description: prizeDescription || null,
          notes: notes || null,
          awarded_by: user.id,
          awarded_at: new Date().toISOString(),
        })
        .eq("id", existingAward.id);

      if (updateError) {
        console.error("[APPROVE-MONTHLY] Failed to update award:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update award record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new award
      const { error: insertError } = await supabase
        .from("sgt_monthly_awards")
        .insert({
          tour_id: tourId,
          month: month,
          winner_player_id: playerId || null,
          winner_player_name: playerName,
          winner_profile_user_id: profileUserId,
          prize_description: prizeDescription || null,
          notes: notes || null,
          awarded_by: user.id,
        });

      if (insertError) {
        console.error("[APPROVE-MONTHLY] Failed to create award:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create award record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[APPROVE-MONTHLY] Award approved successfully for ${playerName}`);

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
        recipientEmail,
        playerName,
        month,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[APPROVE-MONTHLY] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
