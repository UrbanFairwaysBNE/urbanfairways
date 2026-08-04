import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
import { getClubUrl } from "../_shared/sgt-config.ts";

let CLUB_URL = "";

// Get API key - READ-ONLY from database
async function getApiKey(supabase: unknown): Promise<string> {
  const client = supabase as ReturnType<typeof createClient>;
  
  const { data: configData } = await client
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

  console.log(`[SGT-CLEANUP] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

// Helper to extract arrays from SGT API responses
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

// SGT API POST request helper
async function sgtPost(
  apiKey: string, 
  endpoint: string, 
  body: Record<string, string>
): Promise<{ success?: boolean; feedback?: string }> {
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, value);
  }
  
  console.log(`[SGT-CLEANUP] POST: ${endpoint}`, body);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const text = await response.text();
  console.log(`[SGT-CLEANUP] Response: ${text}`);
  
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, feedback: text };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  CLUB_URL = await getClubUrl();


  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run ?? false;

    console.log(`[SGT-CLEANUP] Starting ineligible member cleanup (dry_run: ${dryRun})`);

    const apiKey = await getApiKey(supabase);

    // 1. Get active tour from SGT API
    const toursResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/list?api-key=${apiKey}`);
    const toursData = await toursResponse.json();
    const allTours = extractArray(toursData, ['tours', 'results']) as { tourId: number; name: string; active: number }[];
    const activeTour = allTours.find(t => t.active === 1);

    if (!activeTour) {
      return new Response(
        JSON.stringify({ error: "No active tour found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-CLEANUP] Active tour: ${activeTour.name} (ID: ${activeTour.tourId})`);

    // 2. Get current tournament from local database (most recent upcoming/in-progress)
    const { data: localTournaments } = await supabase
      .from("sgt_tournaments")
      .select("tournament_id, name, status, start_date, end_date")
      .eq("tour_id", activeTour.tourId)
      .in("status", ["Upcoming", "In Progress", "Active"])
      .order("start_date", { ascending: false })
      .limit(1);

    const currentTournament = localTournaments?.[0];

    if (!currentTournament) {
      console.log(`[SGT-CLEANUP] No current tournament found, will skip registration cleanup`);
    } else {
      console.log(`[SGT-CLEANUP] Current tournament: ${currentTournament.name} (ID: ${currentTournament.tournament_id})`);
    }

    // 3. Get club members from SGT API
    const clubMembersResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/members/list?api-key=${apiKey}`);
    const clubMembersData = await clubMembersResponse.json();
    const clubMembers = extractArray(clubMembersData, ['members', 'results']) as { user_id: number; user_name: string }[];

    console.log(`[SGT-CLEANUP] Club has ${clubMembers.length} members from SGT API`);

    // 4. Get tour members from SGT API
    const tourMembersResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/members?api-key=${apiKey}&tourId=${activeTour.tourId}`);
    const tourMembersData = await tourMembersResponse.json();
    const tourMembers = extractArray(tourMembersData, ['members', 'results']) as { user_id: number; user_name: string }[];

    console.log(`[SGT-CLEANUP] Tour has ${tourMembers.length} members from SGT API`);

    // 5. Get tournament registrations if we have a current tournament
    let registrations: { user_id: number; user_name?: string }[] = [];
    if (currentTournament) {
      const registrationsResponse = await fetch(
        `${SGT_BASE_URL}/${CLUB_URL}/registrations/view?api-key=${apiKey}&tournamentId=${currentTournament.tournament_id}`
      );
      const registrationsData = await registrationsResponse.json();
      registrations = extractArray(registrationsData, ['registrations', 'results']) as { user_id: number; user_name?: string }[];
      console.log(`[SGT-CLEANUP] Tournament has ${registrations.length} registrations from SGT API`);
    }

    // 6. Get exempt members from our database
    const { data: exemptMembers } = await supabase
      .from("sgt_members")
      .select("user_id")
      .eq("exempt_from_cleanup", true);

    const exemptUserIds = new Set((exemptMembers || []).map(m => m.user_id));
    console.log(`[SGT-CLEANUP] Found ${exemptUserIds.size} exempt members`);

    // 7. Get linked profiles with paying memberships (birdie or eagle) OR staff
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("sgt_user_id, membership_tier, custom_segment, email, first_name, last_name")
      .not("sgt_user_id", "is", null)
      .or("membership_tier.in.(birdie,eagle),custom_segment.eq.staff");

    const payingMemberIds = new Set((linkedProfiles || []).map(p => p.sgt_user_id));
    console.log(`[SGT-CLEANUP] Found ${payingMemberIds.size} eligible profiles (paying + staff)`);

    // 7b. Grace period — protect anyone who was a paying member within the last 4 weeks
    // (covers members mid-lapse or between subscription cycles so we don't churn them out of SGT)
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPayingChanges } = await supabase
      .from("membership_changes")
      .select("user_id, previous_tier, new_tier, changed_at")
      .or("previous_tier.in.(birdie,eagle),new_tier.in.(birdie,eagle)")
      .gte("changed_at", fourWeeksAgo);

    const recentPayingUserIds = new Set((recentPayingChanges || []).map(c => c.user_id));
    if (recentPayingUserIds.size > 0) {
      const { data: recentProfiles } = await supabase
        .from("profiles")
        .select("sgt_user_id")
        .in("user_id", Array.from(recentPayingUserIds))
        .not("sgt_user_id", "is", null);
      for (const p of recentProfiles || []) {
        if (p.sgt_user_id) payingMemberIds.add(p.sgt_user_id);
      }
    }
    console.log(`[SGT-CLEANUP] Protected pool after 4-week grace period: ${payingMemberIds.size}`);

    // 8. Find ineligible members across all three: club, tour, and registrations
    const allMemberIds = new Map<number, string>();
    
    // Add all club members
    for (const member of clubMembers) {
      allMemberIds.set(member.user_id, member.user_name);
    }
    
    // Add all tour members (in case some are in tour but not club)
    for (const member of tourMembers) {
      if (!allMemberIds.has(member.user_id)) {
        allMemberIds.set(member.user_id, member.user_name);
      }
    }
    
    // Add registrations
    for (const reg of registrations) {
      if (!allMemberIds.has(reg.user_id)) {
        allMemberIds.set(reg.user_id, reg.user_name || `User_${reg.user_id}`);
      }
    }

    // Filter to ineligible (not exempt AND not paying)
    const ineligibleUsers = new Map<number, string>();
    for (const [userId, userName] of allMemberIds) {
      if (!exemptUserIds.has(userId) && !payingMemberIds.has(userId)) {
        ineligibleUsers.set(userId, userName);
      }
    }

    console.log(`[SGT-CLEANUP] Found ${ineligibleUsers.size} ineligible users to clean up`);
    console.log(`[SGT-CLEANUP] Users: ${Array.from(ineligibleUsers.values()).join(', ')}`);

    if (ineligibleUsers.size === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No ineligible members found",
          tour: activeTour.name,
          tournament: currentTournament?.name || null,
          club_members_checked: clubMembers.length,
          tour_members_checked: tourMembers.length,
          registrations_checked: registrations.length,
          exempt_count: exemptUserIds.size,
          paying_count: payingMemberIds.size,
          removed: [] 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ 
          message: "Dry run - no changes made",
          tour: activeTour.name,
          tournament: currentTournament?.name || null,
          club_members_checked: clubMembers.length,
          tour_members_checked: tourMembers.length,
          registrations_checked: registrations.length,
          would_remove: Array.from(ineligibleUsers.entries()).map(([id, name]) => ({ 
            user_id: id, 
            user_name: name,
            in_club: clubMembers.some(m => m.user_id === id),
            in_tour: tourMembers.some(m => m.user_id === id),
            in_tournament: registrations.some(r => r.user_id === id),
          }))
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform actual cleanup
    const results: { 
      user_name: string; 
      user_id: number; 
      registration_removed: boolean;
      tour_removed: boolean;
      club_removed: boolean;
      error?: string;
    }[] = [];

    for (const [userId, userName] of ineligibleUsers) {
      const result = {
        user_name: userName,
        user_id: userId,
        registration_removed: false,
        tour_removed: false,
        club_removed: false,
        error: undefined as string | undefined,
      };

      try {
        // Step 1: Remove from tournament registration (must happen first)
        const isRegistered = registrations.some(r => r.user_id === userId);
        if (isRegistered && currentTournament) {
          // API requires: tournamentId, tourId, user_id (note: userId uses underscore)
          const regResult = await sgtPost("/registrations/delete", {
            tournamentId: currentTournament.tournament_id.toString(),
            tourId: activeTour.tourId.toString(),
            user_id: userId.toString(),
          });
          result.registration_removed = regResult.success === true;
          console.log(`[SGT-CLEANUP] Registration removal for ${userName}: ${result.registration_removed}`);
        }

        // Step 2: Remove from tour
        const isInTour = tourMembers.some(m => m.user_id === userId);
        if (isInTour) {
          // API requires: tourId, user_id (note: tourId is camelCase!)
          const tourResult = await sgtPost("/tours/remove-member", {
            tourId: activeTour.tourId.toString(),
            user_id: userId.toString(),
          });
          result.tour_removed = tourResult.success === true;
          console.log(`[SGT-CLEANUP] Tour removal for ${userName}: ${result.tour_removed}`);
        }

        // Step 3: Remove from club (use /members/remove NOT /members/delete!)
        const isInClub = clubMembers.some(m => m.user_id === userId);
        if (isInClub) {
          // API requires: user_id
          const clubResult = await sgtPost("/members/remove", {
            user_id: userId.toString(),
          });
          result.club_removed = clubResult.success === true;
          console.log(`[SGT-CLEANUP] Club removal for ${userName}: ${result.club_removed}`);
        }

        // Clean up local database — ONLY mirror what actually succeeded on the SGT side.
        // (Deleting the local tour row loses custom_hcp, which forces Combo HCP on re-registration.)
        if (result.tour_removed) {
          await supabase
            .from("sgt_tour_members")
            .delete()
            .eq("user_id", userId)
            .eq("tour_id", activeTour.tourId);
        }

        if (result.club_removed) {
          await supabase
            .from("sgt_members")
            .delete()
            .eq("user_id", userId);
        }


        console.log(`[SGT-CLEANUP] ✓ Cleaned up ${userName}`);
      } catch (error) {
        result.error = error instanceof Error ? error.message : "Unknown error";
        console.error(`[SGT-CLEANUP] Error cleaning up ${userName}:`, error);
      }

      results.push(result);
      
      // Small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const successCount = results.filter(r => 
      r.registration_removed || r.tour_removed || r.club_removed
    ).length;

    console.log(`[SGT-CLEANUP] Completed: ${successCount}/${ineligibleUsers.size} users cleaned up`);

    return new Response(
      JSON.stringify({
        success: true,
        tour: activeTour.name,
        tournament: currentTournament?.name || null,
        total_ineligible: ineligibleUsers.size,
        cleaned_up: successCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-CLEANUP] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
