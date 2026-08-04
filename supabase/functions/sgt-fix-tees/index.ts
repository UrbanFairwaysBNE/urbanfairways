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

  console.log(`[SGT-FIX-TEES] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-FIX-TEES] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

async function deleteAndReregisterPlayer(
  tournamentId: number, 
  tourId: number, 
  userId: number
): Promise<{ success: boolean; error?: string }> {
  
  // Step 1: Delete the registration
  console.log(`[SGT-FIX-TEES] Deleting registration for user ${userId}`);
  const deleteResult = await sgtPostRequest("/registrations/delete", {
    tournamentId,
    tourId,
    userId,
  }) as { success?: boolean; feedback?: string; raw?: string };

  if (!deleteResult.success) {
    const errorMsg = deleteResult.feedback || deleteResult.raw || JSON.stringify(deleteResult);
    return { success: false, error: `Delete failed: ${errorMsg}` };
  }

  // Delay between delete and re-register
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 2: Re-register with Blue tees
  console.log(`[SGT-FIX-TEES] Re-registering user ${userId} with Blue tees`);
  const registerResult = await sgtPostRequestWithRegistrationList(
    "/registrations/register-members",
    tournamentId,
    tourId,
    [{
      user_id: userId,
      useComboCap: "true",
      useCustomCap: "false"
    }]
  ) as { success?: boolean; feedback?: string; raw?: string };

  if (!registerResult.success) {
    const errorMsg = registerResult.feedback || registerResult.raw || JSON.stringify(registerResult);
    return { success: false, error: `Re-register failed: ${errorMsg}` };
  }

  return { success: true };
}

async function sgtPostRequestWithRegistrationList(
  endpoint: string, 
  tournamentId: number,
  tourId: number,
  registrationList: { user_id: number; useComboCap: string; useCustomCap: string }[]
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
  });

  console.log(`[SGT-FIX-TEES] POST: ${endpoint} with ${registrationList.length} registrations (no tee_type)`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const text = await response.text();
  console.log(`[SGT-FIX-TEES] Response:`, text);

  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status} - ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, raw: text };
  }
}

async function sgtPostRequest(endpoint: string, params: Record<string, string | number>): Promise<unknown> {
  const apiKey = await getApiKey();
 
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
 
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value.toString());
  }

  console.log(`[SGT-FIX-TEES] POST: ${endpoint}`, params);
 
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const text = await response.text();
  console.log(`[SGT-FIX-TEES] Response:`, text);

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, raw: text };
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
    const { tournament_id, tour_id } = body;

    if (!tournament_id || !tour_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id and tour_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-FIX-TEES] Fixing tees for tournament ${tournament_id} by delete+re-register using tournament defaults`);

    // Get current registrations for this tournament
    const registrationsResponse = await sgtGetRequest("/registrations/view", { 
      tournamentId: tournament_id.toString() 
    });
    
    const registrations = extractArray(registrationsResponse, ['registrations', 'results']) as { 
      user_id: number; 
      user_name: string;
      tee_type?: string;
    }[];

    console.log(`[SGT-FIX-TEES] Found ${registrations.length} registrations`);
    console.log(`[SGT-FIX-TEES] Current tee types:`, registrations.map(r => ({ user: r.user_name, tee: r.tee_type })));

    const results: { userId: number; userName: string; oldTee: string; success: boolean; error?: string }[] = [];

    // Delete and re-register each player with Blue tees
    for (const reg of registrations) {
      const result = await deleteAndReregisterPlayer(tournament_id, tour_id, reg.user_id);
      results.push({
        userId: reg.user_id,
        userName: reg.user_name,
        oldTee: reg.tee_type || 'unknown',
        success: result.success,
        error: result.error,
      });
      
      // Longer delay between players to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[SGT-FIX-TEES] Completed: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalRegistrations: registrations.length,
        fixed: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-FIX-TEES] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
