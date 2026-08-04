import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant } from "../_shared/tenant.ts";
import { getClubUrl } from "../_shared/sgt-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { tournamentId, playerId, playerName, prizeAmount = 40 } = await req.json();

    if (!tournamentId || !playerId || !playerName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tournamentId, playerId, playerName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[APPROVE-PRIZE] Approving prize for tournament ${tournamentId}, player ${playerId} (${playerName})`);

    // Get tournament name for email
    const { data: tournament } = await supabase
      .from("sgt_tournaments")
      .select("name")
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    const tournamentName = tournament?.name || `Tournament #${tournamentId}`;

    // Check if profile is linked (has sgt_user_id matching playerId)
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, deposit_balance")
      .eq("sgt_user_id", playerId)
      .maybeSingle();

    let profileUserId: string | null = null;
    let emailSent = false;

    if (profile) {
      profileUserId = profile.user_id;
      
      // Credit the deposit balance
      const newBalance = (profile.deposit_balance || 0) + prizeAmount;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", profile.user_id);

      if (updateError) {
        console.error("[APPROVE-PRIZE] Failed to credit balance:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to credit balance" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[APPROVE-PRIZE] Credited $${prizeAmount} to ${profile.email}, new balance: $${newBalance}`);

      // Send winner email
      if (RESEND_API_KEY) {
        try {
          // Get email template
          const { data: template } = await supabase
            .from("email_templates")
            .select("subject, html_content")
            .eq("template_key", "league_weekly_winner")
            .eq("is_active", true)
            .maybeSingle();

          if (template?.html_content) {
            let bodyContent = template.html_content;
            bodyContent = bodyContent.replace(/\{\{first_name\}\}/g, profile.first_name || playerName);
            bodyContent = bodyContent.replace(/\{\{tournament_name\}\}/g, tournamentName);
            bodyContent = bodyContent.replace(/\{\{prize_amount\}\}/g, prizeAmount.toString());

            let subject = template.subject || "Congratulations! You Won This Week's League Prize!";
            subject = subject.replace(/\{\{tournament_name\}\}/g, tournamentName);

            const htmlContent = await renderBrandedEmail(supabase, 
              "You Won This Week!",
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
              console.log(`[APPROVE-PRIZE] Winner email sent to ${profile.email}`);
            } else {
              console.error("[APPROVE-PRIZE] Email send failed:", await emailResponse.text());
            }
          }
        } catch (emailError) {
          console.error("[APPROVE-PRIZE] Email error:", emailError);
        }
      }
    } else {
      console.log(`[APPROVE-PRIZE] Player ${playerId} not linked to a ${tenant.venue_name} profile - no credit/email`);
    }

    // Check if prize record already exists
    const { data: existingPrize } = await supabase
      .from("sgt_weekly_prizes")
      .select("id")
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (existingPrize) {
      // Update existing prize
      const { error: prizeError } = await supabase
        .from("sgt_weekly_prizes")
        .update({
          player_id: playerId,
          player_name: playerName,
          profile_user_id: profileUserId,
          prize_amount: prizeAmount,
          status: "approved",
          email_sent: emailSent,
          awarded_at: new Date().toISOString(),
        })
        .eq("id", existingPrize.id);

      if (prizeError) {
        console.error("[APPROVE-PRIZE] Failed to update prize record:", prizeError);
        return new Response(
          JSON.stringify({ error: "Failed to update prize record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new prize record
      const { error: prizeError } = await supabase
        .from("sgt_weekly_prizes")
        .insert({
          tournament_id: tournamentId,
          player_id: playerId,
          player_name: playerName,
          profile_user_id: profileUserId,
          prize_amount: prizeAmount,
          status: "approved",
          email_sent: emailSent,
        });

      if (prizeError) {
        console.error("[APPROVE-PRIZE] Failed to create prize record:", prizeError);
        return new Response(
          JSON.stringify({ error: "Failed to create prize record" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[APPROVE-PRIZE] Prize approved successfully for ${playerName}`);

    // AUTO-CLOSE TOURNAMENT: Now that the winner is approved, close the tournament on SGT
    let tournamentClosed = false;
    let closeError: string | null = null;
    try {
      // Check if tournament is still open (not already Completed)
      const { data: tournData } = await supabase
        .from("sgt_tournaments")
        .select("status, tour_id")
        .eq("tournament_id", tournamentId)
        .maybeSingle();

      if (tournData && tournData.status !== "Completed") {
        console.log(`[APPROVE-PRIZE] Auto-closing tournament ${tournamentId} (status: ${tournData.status})`);
        
        // Get API key
        const { data: configData } = await supabase
          .from("sgt_api_config")
          .select("api_key, expires_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (configData?.api_key && new Date(configData.expires_at) > new Date()) {
          const clubUrl = await getClubUrl();
          const formData = new URLSearchParams();
          formData.append("api-key", configData.api_key);
          formData.append("tournamentId", tournamentId.toString());
          formData.append("assess_points", "1");

          const closeResponse = await fetch(
            `https://simulatorgolftour.com/sgt-api/club-admin/${clubUrl}/tournaments/close`,
            { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formData }
          );

          if (closeResponse.ok) {
            const closeResult = await closeResponse.json();
            console.log(`[APPROVE-PRIZE] Tournament ${tournamentId} closed successfully:`, JSON.stringify(closeResult));
            
            // Update local status
            await supabase
              .from("sgt_tournaments")
              .update({ status: "Completed" })
              .eq("tournament_id", tournamentId);

            tournamentClosed = true;

            // Trigger monthly standings recalculation now that a tournament is completed
            console.log(`[APPROVE-PRIZE] Triggering monthly standings recalculation...`);
            try {
              const monthlyResponse = await fetch(
                `${supabaseUrl}/functions/v1/sgt-calculate-monthly-standings`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({}),
                }
              );
              if (monthlyResponse.ok) {
                const monthlyResult = await monthlyResponse.json();
                console.log(`[APPROVE-PRIZE] Monthly standings updated:`, JSON.stringify(monthlyResult));
              } else {
                console.error(`[APPROVE-PRIZE] Monthly standings update failed: ${monthlyResponse.status}`);
              }
            } catch (monthlyErr) {
              console.error(`[APPROVE-PRIZE] Monthly standings trigger error:`, monthlyErr);
            }
          } else {
            const errText = await closeResponse.text();
            console.error(`[APPROVE-PRIZE] SGT close API error: ${closeResponse.status} - ${errText}`);
            closeError = `SGT API returned ${closeResponse.status}`;
          }
        } else {
          closeError = "API key missing or expired";
          console.error(`[APPROVE-PRIZE] Cannot close tournament: ${closeError}`);
        }
      } else if (tournData?.status === "Completed") {
        console.log(`[APPROVE-PRIZE] Tournament ${tournamentId} already closed, triggering monthly standings refresh...`);
        tournamentClosed = true;
        
        // Still recalculate monthly standings in case it wasn't done before
        try {
          await fetch(
            `${supabaseUrl}/functions/v1/sgt-calculate-monthly-standings`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({}),
            }
          );
        } catch (monthlyErr) {
          console.error(`[APPROVE-PRIZE] Monthly standings trigger error:`, monthlyErr);
        }
      }
    } catch (err) {
      closeError = err instanceof Error ? err.message : "Unknown close error";
      console.error(`[APPROVE-PRIZE] Failed to auto-close tournament:`, err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        credited: !!profile,
        emailSent,
        playerName,
        prizeAmount,
        tournamentClosed,
        closeError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[APPROVE-PRIZE] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
