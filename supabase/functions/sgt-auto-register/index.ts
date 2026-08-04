import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl } from "../_shared/tenant.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
import { getClubUrl } from "../_shared/sgt-config.ts";

let CLUB_URL = "";

// Supabase client for API key retrieval - set on each request
let supabaseClient: any = null;

// Get API key - READ-ONLY from database
// New keys are only created by the daily sgt-refresh-api-key cron job at 4am
async function getApiKey(): Promise<string> {
  if (!supabaseClient) {
    throw new Error("Supabase client not initialized");
  }

  const { data: configData } = await supabaseClient
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const config = configData as { api_key: string; expires_at: string } | null;
  
  if (!config?.api_key) {
    throw new Error("No API key found in database - run sgt-refresh-api-key first");
  }

  const expiresAt = new Date(config.expires_at);
  const timeUntilExpiry = expiresAt.getTime() - Date.now();
  
  if (timeUntilExpiry <= 0) {
    throw new Error("API key has expired - wait for 4am cron refresh or manually trigger sgt-refresh-api-key");
  }

  console.log(`[SGT-AUTO-REG] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-AUTO-REG] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

async function sgtPostRequest(endpoint: string, body: Record<string, string | number>): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, value.toString());
  }

  console.log(`[SGT-AUTO-REG] POST: ${endpoint}`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SGT API error: ${response.status} - ${text}`);
  }

  return response.json();
}

// Registration item - note: teeType is omitted to use tournament defaults
interface RegistrationItem {
  user_id: number;
  useComboCap: string;
  useCustomCap: string;
  customCap?: number;
}

async function sgtPostRequestWithRegistrationList(
  endpoint: string, 
  tournamentId: number,
  tourId: number,
  registrationList: RegistrationItem[]
): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  
  // Note: teeType is intentionally NOT sent so the API uses tournament default tees
  registrationList.forEach((reg, index) => {
    formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
    formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
    formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
    if (reg.useCustomCap === "true" && reg.customCap !== undefined) {
      formData.append(`registrationList[${index}][customCap]`, reg.customCap.toString());
    }
  });

  console.log(`[SGT-AUTO-REG] POST: ${endpoint} with ${registrationList.length} registrations`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SGT API error: ${response.status} - ${text}`);
  }

  return response.json();
}

function extractArray(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of keys) {
      if (key in data && Array.isArray((data as Record<string, unknown>)[key])) {
        return (data as Record<string, unknown>)[key] as unknown[];
      }
    }
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  CLUB_URL = await getClubUrl();


  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  supabaseClient = createClient(supabaseUrl, supabaseKey);

  try {
    const { sgt_user_id, force_email } = await req.json();

    if (!sgt_user_id) {
      return new Response(
        JSON.stringify({ error: "sgt_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Force email mode: skip registration, just send the league welcome email
    if (force_email) {
      console.log(`[SGT-AUTO-REG] Force email mode for SGT user ${sgt_user_id}`);
      
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("user_id, email, first_name")
        .eq("sgt_user_id", sgt_user_id)
        .maybeSingle();

      const { data: tourMember } = await supabaseClient
        .from("sgt_tour_members")
        .select("tour_id, custom_hcp")
        .eq("user_id", sgt_user_id)
        .limit(1)
        .maybeSingle();

      const handicapDisplay = tourMember?.custom_hcp !== null && tourMember?.custom_hcp !== undefined
        ? String(tourMember.custom_hcp)
        : "Combo (auto)";

      if (!profile?.email) {
        return new Response(JSON.stringify({ error: "No profile with email found" }), 
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: emailTemplate } = await supabaseClient
        .from("email_templates")
        .select("subject, html_content")
        .eq("template_key", "league_welcome")
        .eq("is_active", true)
        .single();

      if (!emailTemplate?.html_content) {
        return new Response(JSON.stringify({ error: "No active league_welcome template" }), 
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const tenant = await getTenant();
      const guideUrl = tenantHubUrl(tenant, "/member-guide");
      const tags: Record<string, string> = {
        '{first_name}': profile.first_name || 'Golfer',
        '{handicap}': handicapDisplay,
        '{guide_url}': guideUrl,
      };

      let bodyContent = emailTemplate.html_content;
      let subject = emailTemplate.subject || `Welcome to the ${tenant.venue_name} League!`;
      for (const [tag, value] of Object.entries(tags)) {
        const escaped = tag.replace(/[{}]/g, '\\$&');
        bodyContent = bodyContent.replace(new RegExp(escaped, 'g'), value);
        subject = subject.replace(new RegExp(escaped, 'g'), value);
      }

      const wrappedHtml = await renderBrandedEmail(supabaseClient, `Welcome to the ${tenant.venue_name} League!`, bodyContent, {
        text: "Read the Player Guide",
        url: guideUrl,
      });

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [profile.email],
          subject,
          html: wrappedHtml,
        }),
      });

      const emailResult = await emailRes.json();
      console.log(`[SGT-AUTO-REG] Force email sent to ${profile.email}:`, emailResult);

      return new Response(JSON.stringify({ success: true, email_sent: true, to: profile.email }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[SGT-AUTO-REG] Processing registration for SGT user ${sgt_user_id}`);

    // Refresh custom handicaps FIRST so registration uses the latest best-3-of-6 average.
    // Otherwise, if the weekly recalc runs after auto-registration, players get registered
    // against a stale custom_hcp (this is why Jake Davies was off 33 instead of ~21).
    try {
      console.log("[SGT-AUTO-REG] Recalculating custom handicaps before registration...");
      const recalcRes = await fetch(`${supabaseUrl}/functions/v1/sgt-recalc-handicaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
      });
      const recalcJson = await recalcRes.json().catch(() => ({}));
      console.log("[SGT-AUTO-REG] Recalc result:", recalcJson?.success ?? recalcJson);
    } catch (recalcErr) {
      console.error("[SGT-AUTO-REG] Recalc failed (continuing with existing custom_hcp):", recalcErr);
    }

    // Check if this member has been onboarded (exists in sgt_tour_members)
    const { data: tourMemberRecords, error: tmError } = await supabaseClient
      .from("sgt_tour_members")
      .select("tour_id, custom_hcp")
      .eq("user_id", sgt_user_id);

    if (tmError) {
      console.error("[SGT-AUTO-REG] Error checking tour members:", tmError);
      throw tmError;
    }

    // If member is NOT in any tours, they're pending onboarding - skip auto-registration
    if (!tourMemberRecords || tourMemberRecords.length === 0) {
      console.log(`[SGT-AUTO-REG] User ${sgt_user_id} not yet onboarded (not in any tours). Skipping auto-registration.`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Member not yet onboarded. Awaiting admin to set handicap.",
          pending: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Member IS onboarded - proceed with tournament registration
    console.log(`[SGT-AUTO-REG] User ${sgt_user_id} is onboarded in ${tourMemberRecords.length} tour(s). Registering for tournaments...`);

    // Build a map of tour_id -> custom_hcp for quick lookup
    const tourHcpMap = new Map<number, number | null>();
    for (const tm of tourMemberRecords) {
      tourHcpMap.set(tm.tour_id, tm.custom_hcp);
    }

    // Get tours this member belongs to
    const memberTourIds = Array.from(tourHcpMap.keys());

    let totalTournamentRegistrations = 0;
    const allErrors: string[] = [];

    // Process each tour the member is in
    for (const tourId of memberTourIds) {
      console.log(`[SGT-AUTO-REG] Processing tour ID: ${tourId}`);

      // Get the custom handicap for this tour
      const customHcp = tourHcpMap.get(tourId);

      // Check global toggle: if "Use Custom HCP" is OFF, use SGT Combo HCP for everyone
      // (ignore custom_hcp entirely, including the onboarding lock)
      const { data: hcpSettings } = await supabaseClient
        .from("sgt_handicap_settings")
        .select("use_custom_hcp")
        .eq("id", "global")
        .maybeSingle();
      const customHcpGloballyEnabled = hcpSettings?.use_custom_hcp ?? false;

      // Custom HCP is used only if globally enabled AND set on this tour member
      const useCustomCap = customHcpGloballyEnabled && customHcp !== null && customHcp !== undefined;

      if (useCustomCap) {
        console.log(`[SGT-AUTO-REG] Using custom handicap ${customHcp} for user ${sgt_user_id} in tour ${tourId}`);
      } else {
        console.log(`[SGT-AUTO-REG] Using Combo HCP for user ${sgt_user_id} in tour ${tourId}`);
      }

      // STEP 1: Ensure user is a TOUR MEMBER on SGT's side (not just a club member)
      // The /members/register-new endpoint only adds them as a club member.
      // We must call /tours/add-member to add them to the tour before registering for tournaments.
      try {
        console.log(`[SGT-AUTO-REG] Adding user ${sgt_user_id} to tour ${tourId} on SGT...`);
        const addMemberResult = await sgtPostRequest("/tours/add-member", {
          tourId: tourId,
          user_id: sgt_user_id,
        });
        console.log(`[SGT-AUTO-REG] Add to tour result:`, addMemberResult);
      } catch (addError) {
        // If they're already a tour member, SGT may return an error - log but continue
        console.warn(`[SGT-AUTO-REG] Add to tour warning (may already be member):`, addError);
      }

      // STEP 2: Get all tournaments for this tour
      const tournamentsResponse = await sgtGetRequest("/tournaments/list", { tourId: tourId.toString() });
      const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']) as { 
        tournamentId: number; 
        name: string; 
        status?: string;
        start_date?: string;
        end_date?: string;
      }[];

      // NEW MEMBER ONBOARDING: Only register for the CURRENT tournament
      // The member will be included in the auto-registration for future tournaments
      // on the morning of those tournament start dates
      const today = new Date().toISOString().split('T')[0];
      
      // Find the current tournament (started but not ended, or starts today)
      const currentTournament = tournaments.find(t => {
        const isNotClosed = t.status !== 'Closed' && t.status !== 'Completed';
        const startDate = t.start_date || '';
        const endDate = t.end_date || '';
        const hasStarted = startDate <= today;
        const notEnded = !endDate || endDate >= today;
        return isNotClosed && hasStarted && notEnded;
      });

      if (!currentTournament) {
        console.log(`[SGT-AUTO-REG] No current tournament found for tour ${tourId} - member will be auto-registered on next tournament start date`);
        continue;
      }

      // Only process the current tournament (not all active/future ones)
      const activeTournaments = [currentTournament];

      console.log(`[SGT-AUTO-REG] Found current tournament for tour ${tourId}: ${currentTournament.name}`);

      // Register user for each active tournament
      for (const tournament of activeTournaments) {
        try {
          // Check if already registered
          const registrationsResponse = await sgtGetRequest("/registrations/view", { 
            tournamentId: tournament.tournamentId.toString() 
          });
          const registrations = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number; registration_id?: number }[];
          
          const existingReg = registrations.find(r => r.user_id === sgt_user_id);
          
          // If already registered AND we have a custom HCP to set, delete the old registration first
          if (existingReg && useCustomCap && customHcp !== null) {
            console.log(`[SGT-AUTO-REG] User already registered for ${tournament.name} - deleting to re-register with custom HCP ${customHcp}`);
            
            // Delete the existing registration
            try {
              const deleteResult = await sgtPostRequest("/registrations/delete", {
                tournamentId: tournament.tournamentId,
                tourId: tourId,
                userId: sgt_user_id,
              });
              console.log(`[SGT-AUTO-REG] Deleted existing registration for ${tournament.name}:`, deleteResult);
            } catch (deleteErr) {
              console.error(`[SGT-AUTO-REG] Failed to delete existing registration:`, deleteErr);
              // Continue anyway - maybe we can still register
            }
          } else if (existingReg) {
            // Already registered and no custom HCP needed - skip
            console.log(`[SGT-AUTO-REG] User already registered for tournament ${tournament.name} with combo HCP`);
            continue;
          }

          // Build registration - omit teeType so API uses tournament default tees
          const registrationItem: RegistrationItem = {
            user_id: sgt_user_id,
            useComboCap: useCustomCap ? "false" : "true",
            useCustomCap: useCustomCap ? "true" : "false",
          };
          
          if (useCustomCap && customHcp !== null) {
            registrationItem.customCap = customHcp;
          }

          // Register for tournament
          console.log(`[SGT-AUTO-REG] Registering user for tournament ${tournament.name} (ID: ${tournament.tournamentId})${useCustomCap ? ` with custom HCP ${customHcp}` : ''}`);
          
          const registerResult = await sgtPostRequestWithRegistrationList(
            "/registrations/register-members",
            tournament.tournamentId,
            tourId,
            [registrationItem]
          ) as { success?: boolean; feedback?: string };

          console.log(`[SGT-AUTO-REG] Registration result for ${tournament.name}:`, registerResult);
          
          if (registerResult?.success === false) {
            const errorMsg = `Registration rejected for ${tournament.name}: ${registerResult.feedback || 'Unknown reason'}`;
            console.error(`[SGT-AUTO-REG] ${errorMsg}`);
            allErrors.push(errorMsg);
          } else {
            totalTournamentRegistrations++;
          }
        } catch (error) {
          const errorMsg = `Failed to register for ${tournament.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[SGT-AUTO-REG] ${errorMsg}`);
          allErrors.push(errorMsg);
        }
      }
    }

    // Trigger a sync to update local cache
    try {
      const syncSecret = Deno.env.get("SYNC_SECRET");
      if (syncSecret) {
        console.log("[SGT-AUTO-REG] Triggering data sync...");
        await fetch(`${supabaseUrl}/functions/v1/sgt-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sync-secret": syncSecret,
          },
        });
      }
    } catch (syncError) {
      console.error("[SGT-AUTO-REG] Sync trigger failed:", syncError);
    }

    // Send league welcome email if registration was successful
    if (totalTournamentRegistrations > 0) {
      try {
        console.log(`[SGT-AUTO-REG] Sending league welcome email for user ${sgt_user_id}...`);

        // Look up the profile linked to this SGT user
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("user_id, email, first_name")
          .eq("sgt_user_id", sgt_user_id)
          .maybeSingle();

        if (profile?.email) {
          // Get the handicap used (from the first tour processed)
          const firstTourId = memberTourIds[0];
          const handicapValue = tourHcpMap.get(firstTourId);
          const handicapDisplay = handicapValue !== null && handicapValue !== undefined
            ? String(handicapValue)
            : "Combo (auto)";

          // Fetch league welcome email template
          const { data: emailTemplate } = await supabaseClient
            .from("email_templates")
            .select("subject, html_content")
            .eq("template_key", "league_welcome")
            .eq("is_active", true)
            .single();

          if (emailTemplate?.html_content) {
            const tenant = await getTenant();
      const guideUrl = tenantHubUrl(tenant, "/member-guide");
            const tags: Record<string, string> = {
              '{first_name}': profile.first_name || 'Golfer',
              '{handicap}': handicapDisplay,
              '{guide_url}': guideUrl,
            };

            let bodyContent = emailTemplate.html_content;
            let subject = emailTemplate.subject || `Welcome to the ${tenant.venue_name} League!`;
            for (const [tag, value] of Object.entries(tags)) {
              const escaped = tag.replace(/[{}]/g, '\\$&');
              bodyContent = bodyContent.replace(new RegExp(escaped, 'g'), value);
              subject = subject.replace(new RegExp(escaped, 'g'), value);
            }

            const wrappedHtml = await renderBrandedEmail(supabaseClient, `Welcome to the ${tenant.venue_name} League!`, bodyContent, {
              text: "Read the Player Guide",
              url: guideUrl,
            });

            // Send via Resend
            const resendKey = Deno.env.get("RESEND_API_KEY");
            if (resendKey) {
              const emailRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${resendKey}`,
                },
                body: JSON.stringify({
                  from: `${tenant2.venue_name} <${tenant2.sender_email}>`,
                  to: [profile.email],
                  subject,
                  html: wrappedHtml,
                }),
              });
              const emailResult = await emailRes.json();
              console.log(`[SGT-AUTO-REG] League welcome email sent to ${profile.email}:`, emailResult);
            } else {
              console.warn("[SGT-AUTO-REG] RESEND_API_KEY not set, skipping league welcome email");

            }
          } else {
            console.warn("[SGT-AUTO-REG] No active league_welcome email template found");
          }
        } else {
          console.log(`[SGT-AUTO-REG] No profile with email found for sgt_user_id ${sgt_user_id}, skipping email`);
        }
      } catch (emailError) {
        console.error("[SGT-AUTO-REG] Failed to send league welcome email:", emailError);
        // Don't fail the whole request for email errors
      }
    }

    const result = {
      success: true,
      tournamentsRegistered: totalTournamentRegistrations,
      toursProcessed: memberTourIds.length,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };

    console.log(`[SGT-AUTO-REG] Completed:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-AUTO-REG] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
