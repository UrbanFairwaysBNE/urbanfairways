import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  console.log(`[SGT-DELETE] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-DELETE] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

async function sgtDeleteRegistration(tournamentId: number, tourId: number, userId: number): Promise<{ success: boolean; error?: string }> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  formData.append("userId", userId.toString());

  console.log(`[SGT-DELETE] Deleting registration for user ${userId}`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const text = await response.text();
  console.log(`[SGT-DELETE] Response:`, text);

  try {
    const result = JSON.parse(text);
    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.feedback || text };
  } catch {
    return { success: false, error: text };
  }
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
    const { tournament_id, tour_id, exclude_username } = body;

    if (!tournament_id || !tour_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id and tour_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const excludeName = exclude_username || "Daryl_C";
    console.log(`[SGT-DELETE] Deleting all registrations except ${excludeName} for tournament ${tournament_id}`);

    // Get current registrations for this tournament
    const registrationsResponse = await sgtGetRequest("/registrations/view", { 
      tournamentId: tournament_id.toString() 
    });
    
    const registrations = extractArray(registrationsResponse, ['registrations', 'results']) as { 
      user_id: number; 
      user_name: string;
    }[];

    console.log(`[SGT-DELETE] Found ${registrations.length} registrations`);

    // Filter out the excluded user
    const toDelete = registrations.filter(r => r.user_name !== excludeName);
    const excluded = registrations.filter(r => r.user_name === excludeName);

    console.log(`[SGT-DELETE] Will delete ${toDelete.length} registrations, keeping ${excluded.length} (${excludeName})`);

    const results: { userId: number; userName: string; success: boolean; error?: string }[] = [];

    // Delete each registration
    for (const reg of toDelete) {
      const result = await sgtDeleteRegistration(tournament_id, tour_id, reg.user_id);
      results.push({
        userId: reg.user_id,
        userName: reg.user_name,
        success: result.success,
        error: result.error,
      });
      
      // Small delay between deletions
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[SGT-DELETE] Completed: ${successCount} deleted, ${failCount} failed, ${excluded.length} kept`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalRegistrations: registrations.length,
        deleted: successCount,
        failed: failCount,
        kept: excluded.map(r => r.user_name),
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-DELETE] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
