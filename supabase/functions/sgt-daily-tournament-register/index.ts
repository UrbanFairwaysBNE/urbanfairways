 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
import { getClubUrl } from "../_shared/sgt-config.ts";

let CLUB_URL = "";
 
 let supabaseClient: ReturnType<typeof createClient>;
 
 interface ApiConfig {
   api_key: string;
   expires_at: string;
 }
 
 interface Tournament {
   tournament_id: number;
   tour_id: number;
   name: string;
   start_date: string;
 }
 
 interface TourMember {
   user_id: number;
   custom_hcp: number | null;
 }
 
 interface TourSettings {
   auto_register_tournaments: boolean;
 }
 
 async function getApiKey(): Promise<string> {
   const { data: configData } = await supabaseClient
     .from("sgt_api_config")
     .select("api_key, expires_at")
     .order("created_at", { ascending: false })
     .limit(1)
     .maybeSingle();
 
   const config = configData as ApiConfig | null;
   if (!config?.api_key) throw new Error("No API key found");
   if (new Date(config.expires_at) <= new Date()) throw new Error("API key expired");
   return config.api_key;
 }
 
 async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
   const apiKey = await getApiKey();
   const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
   url.searchParams.append("api-key", apiKey);
   for (const [key, value] of Object.entries(params)) url.searchParams.append(key, value);
   const response = await fetch(url.toString());
   if (!response.ok) throw new Error(`SGT API error: ${response.status}`);
   return response.json();
 }
 
 interface RegistrationItem {
   user_id: number;
   useComboCap: string;
   useCustomCap: string;
   customCap?: number;
 }
 
 async function sgtPostRequestWithRegistrationList(endpoint: string, tournamentId: number, tourId: number, registrationList: RegistrationItem[]): Promise<unknown> {
   const apiKey = await getApiKey();
   const formData = new URLSearchParams();
   formData.append("api-key", apiKey);
   formData.append("tournamentId", tournamentId.toString());
   formData.append("tourId", tourId.toString());
   registrationList.forEach((reg, index) => {
     formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
     formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
     formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
     if (reg.useCustomCap === "true" && reg.customCap !== undefined) {
       formData.append(`registrationList[${index}][customCap]`, reg.customCap.toString());
     }
   });
   const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formData });
   if (!response.ok) throw new Error(`SGT API error: ${response.status}`);
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
   if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
 
   const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
   const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
   supabaseClient = createClient(supabaseUrl, supabaseKey);
   CLUB_URL = await getClubUrl();
 
   try {
     // Get today's date in Brisbane timezone (AEST/AEDT)
     const now = new Date();
     const brisbaneTime = new Date(now.getTime() + 10 * 60 * 60 * 1000);
     const todayStr = brisbaneTime.toISOString().split('T')[0];
     
     // Also check tomorrow - tournaments are created on Sundays for Monday starts,
     // so the 6AM Sunday cron needs to catch Monday-start tournaments
     const tomorrowTime = new Date(brisbaneTime.getTime() + 24 * 60 * 60 * 1000);
     const tomorrowStr = tomorrowTime.toISOString().split('T')[0];

     console.log(`[SGT-DAILY-REG] Looking for tournaments starting today (${todayStr}) or tomorrow (${tomorrowStr})`);

      // Find tournaments starting today/tomorrow OR currently active (start_date <= today AND end_date >= today)
      const { data: startingData } = await supabaseClient
        .from("sgt_tournaments")
        .select("tournament_id, tour_id, name, start_date")
        .in("start_date", [todayStr, tomorrowStr]);

      const { data: activeData } = await supabaseClient
        .from("sgt_tournaments")
        .select("tournament_id, tour_id, name, start_date")
        .lte("start_date", todayStr)
        .gte("end_date", todayStr);

      // Merge and deduplicate by tournament_id
      const allTournaments = [...(startingData || []), ...(activeData || [])];
      const seen = new Set<number>();
      const tournamentsData = allTournaments.filter(t => {
        if (seen.has(t.tournament_id)) return false;
        seen.add(t.tournament_id);
        return true;
      });
      const tError = null;

    if (tError) throw tError;
    const tournaments = (tournamentsData || []) as Tournament[];

    if (tournaments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No tournaments starting today", registered: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
 
     let totalRegistrations = 0;
     const errors: string[] = [];
 
     for (const tournament of tournaments) {
       try {
         console.log(`[SGT-DAILY-REG] Processing: ${tournament.name}`);
 
         // Check if auto-registration is enabled for this tour
         const { data: tourSettingsData } = await supabaseClient
           .from("sgt_tour_settings")
           .select("auto_register_tournaments")
           .eq("tour_id", tournament.tour_id)
           .maybeSingle();
         const tourSettings = tourSettingsData as TourSettings | null;
 
         if (tourSettings && tourSettings.auto_register_tournaments === false) {
           console.log(`[SGT-DAILY-REG] Auto-registration disabled for tour ${tournament.tour_id}, skipping`);
           continue;
         }
 
         const { data: tourMembersData, error: tmError } = await supabaseClient
           .from("sgt_tour_members")
           .select("user_id, custom_hcp")
           .eq("tour_id", tournament.tour_id);
         const tourMembers = (tourMembersData || []) as TourMember[];
 
         if (tmError || tourMembers.length === 0) continue;
 
         const registrationsResponse = await sgtGetRequest("/registrations/view", { tournamentId: tournament.tournament_id.toString() });
         const existingRegs = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
         const registeredUserIds = new Set(existingRegs.map(r => r.user_id));
 
          const toRegister: RegistrationItem[] = [];
          for (const member of tourMembers) {
            if (registeredUserIds.has(member.user_id)) continue;
            
            // Custom HCP ALWAYS overrides Combo HCP when set
            // This allows admins to manually adjust handicaps for players who are struggling
            const useCustomCap = member.custom_hcp !== null;
            
            console.log(`[SGT-DAILY-REG] Member ${member.user_id}: useCustomCap: ${useCustomCap}, custom_hcp: ${member.custom_hcp}`);
            
            const regItem: RegistrationItem = { 
              user_id: member.user_id, 
              useComboCap: useCustomCap ? "false" : "true", 
              useCustomCap: useCustomCap ? "true" : "false" 
            };
            if (useCustomCap && member.custom_hcp !== null) regItem.customCap = member.custom_hcp;
            toRegister.push(regItem);
          }
 
         if (toRegister.length === 0) continue;
 
         for (let i = 0; i < toRegister.length; i += 10) {
           const batch = toRegister.slice(i, i + 10);
           await sgtPostRequestWithRegistrationList("/registrations/register-members", tournament.tournament_id, tournament.tour_id, batch);
           totalRegistrations += batch.length;
         }
       } catch (error) {
         errors.push(`Failed: ${tournament.name}: ${error instanceof Error ? error.message : 'Unknown'}`);
       }
     }
 
     return new Response(JSON.stringify({ success: true, tournamentsProcessed: tournaments.length, registrations: totalRegistrations, errors: errors.length > 0 ? errors : undefined }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
   } catch (error) {
     return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
   }
 });