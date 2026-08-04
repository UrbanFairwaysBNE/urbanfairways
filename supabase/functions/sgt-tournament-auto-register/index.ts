import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
import { getClubUrl } from "../_shared/sgt-config.ts";

let CLUB_URL = "";

// Supabase client for API key retrieval
let supabaseClient: ReturnType<typeof createClient> | null = null;

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

  console.log(`[SGT-TOURN-REG] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-TOURN-REG] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

// Registration list - teeType is intentionally omitted to use tournament defaults
async function sgtPostRequestWithRegistrationList(
  endpoint: string, 
  tournamentId: number,
  tourId: number,
  registrationList: { user_id: number; useComboCap: string; useCustomCap: string; customCap?: number }[]
): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  
  // Note: teeType is NOT sent so the API uses tournament default tees
  registrationList.forEach((reg, index) => {
    formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
    formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
    formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
    // Include customCap when using custom handicap
    if (reg.useCustomCap === "true" && reg.customCap !== undefined) {
      formData.append(`registrationList[${index}][customCap]`, reg.customCap.toString());
    }
  });

  console.log(`[SGT-TOURN-REG] POST: ${endpoint} with ${registrationList.length} registrations`);
  
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

// Delete a single registration
async function sgtPostRequestDelete(tournamentId: number, tourId: number, userId: number): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  formData.append("userId", userId.toString());

  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/delete`, {
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
    const body = await req.json().catch(() => ({}));
    const { tournament_id, tour_id, force_reregister } = body;

    console.log(`[SGT-TOURN-REG] Request received - ${force_reregister ? 'Force re-registration' : 'Daily auto-registration'} for ${tournament_id ? `tournament ${tournament_id}` : 'all active tournaments'}`);

    const results: { tournamentId: number; tournamentName: string; tourName: string; registered: number; alreadyRegistered: number; skipped: number; errors: string[] }[] = [];

    // If specific tournament provided, register for that one
    if (tournament_id && tour_id) {
      console.log(`[SGT-TOURN-REG] Registering all members for specific tournament ${tournament_id}${force_reregister ? ' (FORCE RE-REGISTER)' : ''}`);
      const result = await registerAllMembersForTournament(tournament_id, tour_id, undefined, undefined, force_reregister);
      results.push(result);
    } else {
      // Get ALL active tours from SGT API
      const toursResponse = await sgtGetRequest("/tours/list");
      const allTours = extractArray(toursResponse, ['tours', 'results']) as { 
        tourId: number; 
        name: string; 
        active: number; 
      }[];
      
      const activeTours = allTours.filter(t => t.active === 1);
      console.log(`[SGT-TOURN-REG] Found ${activeTours.length} active tours`);

      // Process each active tour
      for (const tour of activeTours) {
        const tourId = tour.tourId;
        console.log(`[SGT-TOURN-REG] Processing tour ${tour.name} (ID: ${tourId})`);

        // Get all tournaments for this tour
        const tournamentsResponse = await sgtGetRequest("/tournaments/list", { tourId: tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']) as { 
          tournamentId: number; 
          name: string; 
          status?: string;
          start_date?: string;
          end_date?: string;
        }[];

        // Find tournaments that are active, in progress, OR start within the next 48 hours
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const activeTournaments = tournaments.filter(t => {
          const startDate = t.start_date || '';
          const endDate = t.end_date || '';
          const isNotClosed = t.status !== 'Closed' && t.status !== 'Completed';
          
          // Include if:
          // 1. Already started/active/in progress and not yet ended
          // 2. Starting within 48 hours (upcoming)
          const isInProgress = t.status === 'In Progress' || t.status === 'Active';
          const hasStarted = startDate <= today && (!endDate || endDate >= today);
          const startsWithin48h = startDate > today && startDate <= in48Hours;
          const isUpcoming = t.status === 'Upcoming';
          
          return isNotClosed && (isInProgress || hasStarted || (isUpcoming && startsWithin48h));
        });

        console.log(`[SGT-TOURN-REG] Found ${activeTournaments.length} active/upcoming tournaments for tour ${tour.name} (checking up to ${in48Hours})`);

        for (const tournament of activeTournaments) {
          const result = await registerAllMembersForTournament(
            tournament.tournamentId,
            tourId,
            tournament.name,
            tour.name
          );
          results.push(result);
        }
      }
    }

    // Trigger a sync to update local cache
    try {
      const syncSecret = Deno.env.get("SYNC_SECRET");
      if (syncSecret) {
        console.log("[SGT-TOURN-REG] Triggering data sync...");
        await fetch(`${supabaseUrl}/functions/v1/sgt-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sync-secret": syncSecret,
          },
        });
      }
    } catch (syncError) {
      console.error("[SGT-TOURN-REG] Sync trigger failed:", syncError);
    }

    const totalRegistered = results.reduce((sum, r) => sum + r.registered, 0);
    const totalAlreadyRegistered = results.reduce((sum, r) => sum + r.alreadyRegistered, 0);

    console.log(`[SGT-TOURN-REG] Completed: ${totalRegistered} new registrations, ${totalAlreadyRegistered} already registered`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalRegistered,
        totalAlreadyRegistered,
        tournaments: results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-TOURN-REG] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function registerAllMembersForTournament(
  tournamentId: number, 
  tourId: number, 
  tournamentName?: string,
  tourName?: string,
  forceReregister?: boolean
): Promise<{ tournamentId: number; tournamentName: string; tourName: string; registered: number; alreadyRegistered: number; deleted: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let deletedCount = 0;
  let skippedCount = 0;
  
  console.log(`[SGT-TOURN-REG] ${forceReregister ? 'Force re-registering' : 'Registering'} eligible members for tournament ${tournamentId} (tour ${tourId})`);

  // Get current registrations for this tournament
  const registrationsResponse = await sgtGetRequest("/registrations/view", { 
    tournamentId: tournamentId.toString() 
  });
  const currentRegistrations = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
  const registeredUserIds = new Set(currentRegistrations.map(r => r.user_id));

  console.log(`[SGT-TOURN-REG] Tournament has ${registeredUserIds.size} existing registrations`);

  // If force re-register, delete ALL existing registrations first
  if (forceReregister && currentRegistrations.length > 0) {
    console.log(`[SGT-TOURN-REG] Force mode: Deleting ${currentRegistrations.length} existing registrations...`);
    
    for (const reg of currentRegistrations) {
      try {
        await sgtPostRequestDelete(tournamentId, tourId, reg.user_id);
        deletedCount++;
        console.log(`[SGT-TOURN-REG] Deleted registration for user ${reg.user_id}`);
      } catch (err) {
        const errMsg = `Failed to delete registration for user ${reg.user_id}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(`[SGT-TOURN-REG] ${errMsg}`);
        errors.push(errMsg);
      }
    }
    
    console.log(`[SGT-TOURN-REG] Deleted ${deletedCount} registrations`);
    registeredUserIds.clear();
  }

  // Get all tour members from SGT API
  const tourMembersResponse = await sgtGetRequest("/tours/members", { tourId: tourId.toString() });
  const allTourMembers = extractArray(tourMembersResponse, ['members', 'results']) as {
    user_id: number; user_name: string; hcp_index?: number | null; custom_hcp?: number | null;
  }[];

  console.log(`[SGT-TOURN-REG] Tour has ${allTourMembers.length} total members`);

  // Fetch custom HCPs from local database for this tour
  const { data: localTourMembers } = await supabaseClient
    .from("sgt_tour_members")
    .select("user_id, custom_hcp")
    .eq("tour_id", tourId);
  
  // Build a map of user_id -> custom_hcp
  const customHcpMap = new Map<number, number | null>();
  (localTourMembers || []).forEach((m: { user_id: number; custom_hcp: number | null }) => {
    customHcpMap.set(m.user_id, m.custom_hcp);
  });

  // SELF-HEAL: if a tour member has no local row (e.g. wiped by a past cleanup) but SGT
  // still holds their venue custom HCP, restore it instead of silently falling back to Combo HCP.
  for (const m of allTourMembers) {
    if (!customHcpMap.has(m.user_id) && m.custom_hcp !== null && m.custom_hcp !== undefined) {
      customHcpMap.set(m.user_id, m.custom_hcp);
      await supabaseClient.from("sgt_tour_members").upsert({
        tour_id: tourId,
        user_id: m.user_id,
        user_name: m.user_name,
        hcp_index: m.hcp_index ?? null,
        custom_hcp: m.custom_hcp,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tour_id,user_id' });
      console.log(`[SGT-TOURN-REG] Restored missing local tour row for ${m.user_name} (custom_hcp ${m.custom_hcp})`);
    }
  }
  
  console.log(`[SGT-TOURN-REG] Found ${customHcpMap.size} members with local handicap data`);


  // CRITICAL: Filter to only eligible members
  // Eligible = linked profile with non-visitor tier, OR custom_segment='staff', OR exempt_from_cleanup
  if (!supabaseClient) {
    throw new Error("Supabase client not initialized");
  }

  // Eligible profiles: non-visitor membership OR staff segment
  const { data: eligibleProfiles } = await supabaseClient
    .from("profiles")
    .select("sgt_user_id, membership_tier, custom_segment")
    .not("sgt_user_id", "is", null)
    .or("membership_tier.neq.visitor,custom_segment.eq.staff");

  const { data: exemptMembers } = await supabaseClient
    .from("sgt_members")
    .select("user_id")
    .eq("exempt_from_cleanup", true);

  const linkedSgtUserIds = new Set((eligibleProfiles || []).map((p: { sgt_user_id: number }) => p.sgt_user_id));
  const exemptSgtUserIds = new Set((exemptMembers || []).map((m: { user_id: number }) => m.user_id));
  const staffCount = (eligibleProfiles || []).filter((p: { custom_segment: string | null }) => p.custom_segment === 'staff').length;

  console.log(`[SGT-TOURN-REG] Found ${linkedSgtUserIds.size} eligible profiles (members + ${staffCount} staff)`);
  console.log(`[SGT-TOURN-REG] Found ${exemptSgtUserIds.size} exempt members`);

  // Filter tour members to only eligible ones
  const eligibleMembers = allTourMembers.filter(member => {
    const isLinkedMember = linkedSgtUserIds.has(member.user_id);
    const isExempt = exemptSgtUserIds.has(member.user_id);
    return isLinkedMember || isExempt;
  });

  const ineligibleCount = allTourMembers.length - eligibleMembers.length;
  skippedCount = ineligibleCount;

  console.log(`[SGT-TOURN-REG] ${eligibleMembers.length} eligible members, ${ineligibleCount} ineligible (no membership/not exempt)`);

  // Find eligible members not yet registered
  const membersToRegister = eligibleMembers.filter(m => !registeredUserIds.has(m.user_id));

  console.log(`[SGT-TOURN-REG] ${membersToRegister.length} eligible members need registration`);

  if (membersToRegister.length === 0) {
    return {
      tournamentId,
      tournamentName: tournamentName || `Tournament ${tournamentId}`,
      tourName: tourName || `Tour ${tourId}`,
      registered: 0,
      alreadyRegistered: eligibleMembers.length - membersToRegister.length,
      deleted: deletedCount,
      skipped: skippedCount,
      errors
    };
  }

  // Register eligible unregistered members in batches
  const batchSize = 20;
  let totalRegistered = 0;

  for (let i = 0; i < membersToRegister.length; i += batchSize) {
    const batch = membersToRegister.slice(i, i + batchSize);
    
    const registrationList = batch.map(member => {
      // Check if this member has a custom HCP override set in the database
      const customHcp = customHcpMap.get(member.user_id);
      const useCustomCap = customHcp !== null && customHcp !== undefined;
      
      if (useCustomCap) {
        console.log(`[SGT-TOURN-REG] Member ${member.user_id} (${member.user_name}): Using CUSTOM HCP ${customHcp}`);
      } else {
        console.log(`[SGT-TOURN-REG] Member ${member.user_id} (${member.user_name}): Using COMBO HCP`);
      }
      
      return {
        user_id: member.user_id,
        useComboCap: useCustomCap ? "false" : "true",
        useCustomCap: useCustomCap ? "true" : "false",
        ...(useCustomCap && customHcp !== null ? { customCap: customHcp } : {}),
      };
    });

    try {
      const result = await sgtPostRequestWithRegistrationList(
        "/registrations/register-members",
        tournamentId,
        tourId,
        registrationList
      );
      
      console.log(`[SGT-TOURN-REG] Batch registration result:`, result);
      totalRegistered += batch.length;
    } catch (error) {
      const errorMsg = `Batch registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[SGT-TOURN-REG] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    tournamentId,
    tournamentName: tournamentName || `Tournament ${tournamentId}`,
    tourName: tourName || `Tour ${tourId}`,
    registered: totalRegistered,
    alreadyRegistered: eligibleMembers.length - membersToRegister.length,
    deleted: deletedCount,
    skipped: skippedCount,
    errors
  };
}
