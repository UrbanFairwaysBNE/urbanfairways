import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSgtApiKey, getSgtConfig, recordSgtStatus } from "../_shared/sgt-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";

// Admin client for API key retrieval - set on each request
let adminClient: any = null;

// Get API key - READ-ONLY from database
// New keys are only created by the daily sgt-refresh-api-key cron job at 4am
async function getApiKey(clubUrl: string): Promise<string> {
  if (!adminClient) {
    throw new Error("Admin client not initialized");
  }

  const { data: configData } = await adminClient
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

  console.log(`[SGT-MEMBER-MGMT] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

async function sgtRequest(
  clubUrl: string, 
  endpoint: string, 
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>
): Promise<unknown> {
  const apiKey = await getApiKey(clubUrl);
  
  if (method === "GET") {
    const url = new URL(`${SGT_BASE_URL}/${clubUrl}${endpoint}`);
    url.searchParams.append("api-key", apiKey);
    
    console.log(`[SGT-MEMBER-MGMT] GET: ${endpoint}`);
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`SGT API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data === "INVALID API KEY") {
      throw new Error("Invalid API key - wait for 4am cron refresh or manually trigger sgt-refresh-api-key");
    }
    
    return data;
  } else {
    const formData = new URLSearchParams();
    formData.append("api-key", apiKey);
    
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        formData.append(key, value);
      }
    }
    
    console.log(`[SGT-MEMBER-MGMT] POST: ${endpoint}`, body);
    const response = await fetch(`${SGT_BASE_URL}/${clubUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    
    const data = await response.json();
    console.log(`[SGT-MEMBER-MGMT] Response:`, data);
    
    if (data === "INVALID API KEY") {
      throw new Error("Invalid API key - wait for 4am cron refresh or manually trigger sgt-refresh-api-key");
    }
    
    return data;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clubUrl = (await getSgtConfig()).clubUrl;

  const authHeader = req.headers.get("Authorization");
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // Check for service-role access via SYNC_SECRET header (for internal calls)
    const syncSecret = req.headers.get("x-sync-secret");
    const expectedSecret = Deno.env.get("SYNC_SECRET");
    const isServiceCall = syncSecret && expectedSecret && syncSecret === expectedSecret;

    if (!isServiceCall) {
      // Verify the user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("[SGT-MEMBER-MGMT] Auth error:", authError);
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if user is admin
      const { data: roles } = await adminClient
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
    } else {
      console.log("[SGT-MEMBER-MGMT] Service call authenticated via SYNC_SECRET");
    }

    const { action, ...params } = await req.json();
    console.log(`[SGT-MEMBER-MGMT] Action: ${action}`, params);

    let result: unknown;

    switch (action) {
      // ---------- SGT connection settings (SGT Manager → Settings) ----------
      case "get-config": {
        const config = await getSgtConfig(true);
        const { data: keyRow } = await adminClient
          .from("sgt_api_config")
          .select("expires_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        result = {
          club_url: config.clubUrl,
          username: config.username ?? "",
          has_password: Boolean(config.password),
          credentials_valid: config.credentialsValid,
          last_verified_at: config.lastVerifiedAt,
          last_error: config.lastError,
          api_key_expires_at: keyRow?.expires_at ?? null,
          api_key_updated_at: keyRow?.updated_at ?? null,
        };
        break;
      }

      case "save-config": {
        const { club_url, username, password } = params as {
          club_url?: string;
          username?: string;
          password?: string;
        };

        const update: Record<string, unknown> = { id: "global" };
        if (typeof club_url === "string") {
          update.club_url = club_url.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        }
        if (typeof username === "string") update.sgt_username = username.trim();
        // Empty string means "leave unchanged" so we never wipe a saved password.
        if (typeof password === "string" && password.length > 0) update.sgt_password = password;

        const { error: saveError } = await adminClient
          .from("sgt_club_config")
          .upsert(update, { onConflict: "id" });

        if (saveError) throw new Error(saveError.message);

        await getSgtConfig(true);
        result = { success: true };
        break;
      }

      case "verify-credentials": {
        try {
          const created = await createSgtApiKey();
          const config = await getSgtConfig(true);

          // Prove the key actually works against this club
          const members = await sgtRequest(config.clubUrl, "/members/list", "GET") as
            | { members?: unknown[] }
            | unknown[];
          const memberCount = Array.isArray(members)
            ? members.length
            : Array.isArray(members?.members) ? members.members.length : 0;

          result = {
            success: true,
            club_url: config.clubUrl,
            member_count: memberCount,
            api_key_expires_at: created.expiresAt,
          };
        } catch (verifyError) {
          const message = verifyError instanceof Error ? verifyError.message : "Unknown error";
          await recordSgtStatus(false, message);
          result = { success: false, error: message };
        }
        break;
      }

      case "add-member": {
        // Add an existing SGT user to the club by their user_id
        const { userId, email, userName } = params;
        if (!userId) throw new Error("userId is required");

        console.log(`[SGT-MEMBER-MGMT] Adding SGT user ${userId} to club`);
        
        const response = await sgtRequest(clubUrl, "/members/add", "POST", {
          user_id: userId.toString(),
        }) as { success?: boolean; feedback?: string };

        if (response.success) {
          // Add to local sgt_members table
          await adminClient.from("sgt_members").upsert({
            user_id: userId,
            user_name: userName || `SGT User ${userId}`,
            user_email: email || null,
            user_active: 1,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

          // If email provided, try to link to a profile
          if (email) {
            await adminClient
              .from("profiles")
              .update({ sgt_user_id: userId })
              .eq("email", email.toLowerCase());
          }
        }

        result = { success: response.success ?? false, feedback: response.feedback };
        break;
      }

      case "delete-member": {
        // Delete/remove a member from the club
        // NOTE: We do NOT clear sgt_user_id from profiles anymore - 
        // this allows us to re-add them later if they become a paying member again
        const { userId, clearProfileLink } = params;
        if (!userId) throw new Error("userId is required");

        // Use /members/remove endpoint (NOT /members/delete which doesn't exist)
        const response = await sgtRequest(clubUrl, "/members/remove", "POST", {
          user_id: userId.toString(),
        });

        // Also remove from our local database. Tour rows must go too, otherwise
        // the member keeps showing in League Members and the daily job tries to
        // re-register a player who is no longer in the club.
        await adminClient
          .from("sgt_members")
          .delete()
          .eq("user_id", userId);

        await adminClient
          .from("sgt_tour_members")
          .delete()
          .eq("user_id", userId);

        // Only clear the sgt_user_id from profile if explicitly requested
        // Default behavior: keep the link so we can re-add them later
        if (clearProfileLink === true) {
          await adminClient
            .from("profiles")
            .update({ sgt_user_id: null })
            .eq("sgt_user_id", userId);
          console.log(`[SGT-MEMBER-MGMT] Cleared profile link for user ${userId}`);
        } else {
          console.log(`[SGT-MEMBER-MGMT] Kept profile link for user ${userId} (can re-add later)`);
        }

        result = { success: true, response };
        break;
      }

      case "deactivate-member": {
        // Deactivate a member (make inactive)
        const { userId } = params;
        if (!userId) throw new Error("userId is required");

        const response = await sgtRequest(clubUrl, "/members/deactivate", "POST", {
          user_id: userId.toString(),
        });

        // Update local database
        await adminClient
          .from("sgt_members")
          .update({ user_active: 0 })
          .eq("user_id", userId);

        result = { success: true, response };
        break;
      }

      case "activate-member": {
        // Reactivate a member
        const { userId } = params;
        if (!userId) throw new Error("userId is required");

        const response = await sgtRequest(clubUrl, "/members/activate", "POST", {
          user_id: userId.toString(),
        });

        // Update local database
        await adminClient
          .from("sgt_members")
          .update({ user_active: 1 })
          .eq("user_id", userId);

        result = { success: true, response };
        break;
      }

      case "add-to-tour": {
        // Add a member to a tour
        const { userId, tourId, customHcp } = params;
        if (!userId || !tourId) throw new Error("userId and tourId are required");

        const body: Record<string, string> = {
          user_id: userId.toString(),
          tour_id: tourId.toString(),
        };
        
        if (customHcp !== undefined) {
          body.custom_hcp = customHcp.toString();
        }

        const response = await sgtRequest(clubUrl, "/tours/add-member", "POST", body);

        result = { success: true, response };
        break;
      }

      case "remove-from-tour": {
        // Remove a member from a tour
        const { userId, tourId } = params;
        if (!userId || !tourId) throw new Error("userId and tourId are required");

        const response = await sgtRequest(clubUrl, "/tours/remove-member", "POST", {
          user_id: userId.toString(),
          tour_id: tourId.toString(),
        });

        // Also remove from local database
        await adminClient
          .from("sgt_tour_members")
          .delete()
          .eq("user_id", userId)
          .eq("tour_id", tourId);

        result = { success: true, response };
        break;
      }

      case "add-to-tournament": {
        // Register a member for a tournament
        const { userId, tournamentId } = params;
        if (!userId || !tournamentId) throw new Error("userId and tournamentId are required");

        const response = await sgtRequest(clubUrl, "/tournaments/add-member", "POST", {
          user_id: userId.toString(),
          tournament_id: tournamentId.toString(),
        });

        result = { success: true, response };
        break;
      }

      case "remove-from-tournament": {
        // Remove a member from a tournament
        const { userId, tournamentId } = params;
        if (!userId || !tournamentId) throw new Error("userId and tournamentId are required");

        const response = await sgtRequest(clubUrl, "/tournaments/remove-member", "POST", {
          user_id: userId.toString(),
          tournament_id: tournamentId.toString(),
        });

        result = { success: true, response };
        break;
      }

      case "bulk-add-to-tour": {
        // Add multiple members to a tour
        const { userIds, tourId, customHcp } = params;
        if (!userIds || !Array.isArray(userIds) || !tourId) {
          throw new Error("userIds (array) and tourId are required");
        }

        const results = [];
        for (const userId of userIds) {
          try {
            const body: Record<string, string> = {
              user_id: userId.toString(),
              tour_id: tourId.toString(),
            };
            
            if (customHcp !== undefined) {
              body.custom_hcp = customHcp.toString();
            }

            const response = await sgtRequest(clubUrl, "/tours/add-member", "POST", body);
            results.push({ userId, success: true, response });
          } catch (error) {
            results.push({ 
              userId, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
          }
        }

        result = { success: true, results };
        break;
      }

      case "bulk-add-to-tournament": {
        // Add multiple members to a tournament
        const { userIds, tournamentId } = params;
        if (!userIds || !Array.isArray(userIds) || !tournamentId) {
          throw new Error("userIds (array) and tournamentId are required");
        }

        const results = [];
        for (const userId of userIds) {
          try {
            const response = await sgtRequest(clubUrl, "/tournaments/add-member", "POST", {
              user_id: userId.toString(),
              tournament_id: tournamentId.toString(),
            });
            results.push({ userId, success: true, response });
          } catch (error) {
            results.push({ 
              userId, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
          }
        }

        result = { success: true, results };
        break;
      }

      case "get-tour-members": {
        // Get members registered for a tour
        const { tourId } = params;
        if (!tourId) throw new Error("tourId is required");

        const response = await sgtRequest(clubUrl, `/tours/members?tour_id=${tourId}`);
        result = response;
        break;
      }

      case "get-tournament-members": {
        // Get members registered for a tournament
        const { tournamentId } = params;
        if (!tournamentId) throw new Error("tournamentId is required");

        const response = await sgtRequest(clubUrl, `/tournaments/members?tournament_id=${tournamentId}`);
        result = response;
        break;
      }

      case "update-member-handicap": {
        // Update a member's custom handicap for a tour
        const { userId, tourId, customHcp } = params;
        if (!userId || !tourId) throw new Error("userId and tourId are required");

        const response = await sgtRequest(clubUrl, "/tours/update-member", "POST", {
          user_id: userId.toString(),
          tour_id: tourId.toString(),
          custom_hcp: (customHcp || 0).toString(),
        });

        // Update local database
        await adminClient
          .from("sgt_tour_members")
          .update({ custom_hcp: customHcp })
          .eq("user_id", userId)
          .eq("tour_id", tourId);

        result = { success: true, response };
        break;
      }

      case "register-all-to-tour": {
        // Register all active SGT members to a tour
        const { tourId, useComboHandicap } = params;
        if (!tourId) throw new Error("tourId is required");

        // Get all active members from our database
        const { data: members, error: membersError } = await adminClient
          .from("sgt_members")
          .select("user_id, user_name")
          .eq("user_active", 1);

        if (membersError) throw membersError;

        // Get existing tour members to skip
        const { data: existingMembers } = await adminClient
          .from("sgt_tour_members")
          .select("user_id")
          .eq("tour_id", tourId);

        const existingUserIds = new Set(existingMembers?.map((m: { user_id: number }) => m.user_id) || []);

        const results = [];
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const member of members || []) {
          // Skip if already registered
          if (existingUserIds.has(member.user_id)) {
            skipCount++;
            results.push({ userId: member.user_id, skipped: true });
            continue;
          }

          try {
            const body: Record<string, string> = {
              user_id: member.user_id.toString(),
              tour_id: tourId.toString(),
            };
            
            // Add combo handicap parameter if enabled
            if (useComboHandicap) {
              body.useComboCapstring = "true";
            }

            const response = await sgtRequest(clubUrl, "/tours/add-member", "POST", body);
            results.push({ userId: member.user_id, success: true, response });
            successCount++;
          } catch (error) {
            results.push({ 
              userId: member.user_id, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
            errorCount++;
          }
        }

        console.log(`[SGT-MEMBER-MGMT] Register all to tour ${tourId}: ${successCount} success, ${skipCount} skipped, ${errorCount} errors`);
        
        result = { 
          success: true, 
          successCount, 
          skipCount, 
          errorCount, 
          totalMembers: members?.length || 0,
          results 
        };
        break;
      }

      case "register-all-to-tournament": {
        // Register all tour members to a specific tournament
        const { tournamentId, tourId } = params;
        if (!tournamentId || !tourId) throw new Error("tournamentId and tourId are required");

        // Get all tour members
        const { data: tourMembers, error: tmError } = await adminClient
          .from("sgt_tour_members")
          .select("user_id, user_name")
          .eq("tour_id", tourId);

        if (tmError) throw tmError;

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const member of tourMembers || []) {
          try {
            const response = await sgtRequest(clubUrl, "/tournaments/add-member", "POST", {
              user_id: member.user_id.toString(),
              tournament_id: tournamentId.toString(),
            });
            results.push({ userId: member.user_id, success: true, response });
            successCount++;
          } catch (error) {
            results.push({ 
              userId: member.user_id, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
            errorCount++;
          }
        }

        console.log(`[SGT-MEMBER-MGMT] Register all to tournament ${tournamentId}: ${successCount} success, ${errorCount} errors`);
        
        result = { 
          success: true, 
          successCount, 
          errorCount, 
          totalMembers: tourMembers?.length || 0,
          results 
        };
        break;
      }

      case "create-tour": {
        // Create a new tour
        const { tourname, startdate, enddate, active, tourtype, tourpublic } = params;
        if (!tourname || !startdate || !enddate) {
          throw new Error("tourname, startdate, and enddate are required");
        }

        const response = await sgtRequest(clubUrl, "/tours/create", "POST", {
          tourname: tourname,
          startdate: startdate,
          enddate: enddate,
          active: (active ?? 1).toString(),
          tourtype: (tourtype ?? 0).toString(),
          tourpublic: (tourpublic ?? 0).toString(),
        }) as { success?: boolean; feedback?: string; tourId?: number };

        if (response.success && response.tourId) {
          // Add the tour to our local database
          await adminClient
            .from("sgt_tours")
            .insert({
              tour_id: response.tourId,
              name: tourname,
              start_date: startdate,
              end_date: enddate,
              active: active ?? 1,
              team_tour: tourtype ?? 0,
            });
          
          console.log(`[SGT-MEMBER-MGMT] Created tour: ${tourname} (ID: ${response.tourId})`);
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback,
          tourId: response.tourId 
        };
        break;
      }

      case "edit-tour": {
        // Edit an existing tour
        const { tourId, tourname, startdate, enddate, active, tourtype, tourpublic } = params;
        if (!tourId || !tourname || !startdate || !enddate) {
          throw new Error("tourId, tourname, startdate, and enddate are required");
        }

        const response = await sgtRequest(clubUrl, "/tours/edit", "POST", {
          tourId: tourId.toString(),
          tourname: tourname,
          startdate: startdate,
          enddate: enddate,
          active: (active ?? 1).toString(),
          tourtype: (tourtype ?? 0).toString(),
          tourpublic: (tourpublic ?? 0).toString(),
        }) as { success?: boolean; feedback?: string };

        if (response.success) {
          // Update our local database
          await adminClient
            .from("sgt_tours")
            .update({
              name: tourname,
              start_date: startdate,
              end_date: enddate,
              active: active ?? 1,
              team_tour: tourtype ?? 0,
            })
            .eq("tour_id", tourId);
          
          console.log(`[SGT-MEMBER-MGMT] Updated tour: ${tourname} (ID: ${tourId})`);
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback 
        };
        break;
      }

      case "create-tournament": {
        // Create a new tournament with full SGT API options
        const { 
          tournamentname, tourId, 
          // Tournament settings
          numberrounds, registrationon, statson, clubcombo, clubwgr, points, gameplay,
          stableford, numberholes, gimmes, puttingmode, head2head, hideleaderboard,
          skins, mulligans, attempts,
          // Dates
          regstartdate, regenddate, startdate, enddate,
          // Round 1 config
          course1select, green1speed, green1firmness, fairway1firmness, tees1, pins1, wind1,
          // Round 2 config (optional)
          course2select, green2speed, green2firmness, fairway2firmness, tees2, pins2, wind2,
          // Round 3 config (optional)
          course3select, green3speed, green3firmness, fairway3firmness, tees3, pins3, wind3,
          // Round 4 config (optional)
          course4select, green4speed, green4firmness, fairway4firmness, tees4, pins4, wind4,
        } = params;
        
        if (!tournamentname || !tourId || !startdate || !enddate || !course1select) {
          throw new Error("tournamentname, tourId, startdate, enddate, and course1select are required");
        }

        // Build the request body with all SGT API parameters
        const body: Record<string, string> = {
          tourneyname: tournamentname,
          tourId: tourId.toString(),
          // Tournament settings
          numberrounds: (numberrounds ?? 1).toString(),
          registrationon: (registrationon ?? 1).toString(),
          statson: (statson ?? 1).toString(), // Include in WGR & tour statistics
          clubcombo: (clubcombo ?? 1).toString(),
          points: points ?? "Tour",
          gameplay: gameplay ?? "Normal",
          stableford: (stableford ?? 0).toString(),
          numberholes: numberholes ?? "18",
          gimmes: (gimmes ?? 0).toString(),
          puttingmode: puttingmode ?? "Optimistic",
          head2head: (head2head ?? 0).toString(),
          hideleaderboard: (hideleaderboard ?? 0).toString(),
          skins: (skins ?? 0).toString(),
          mulligans: (mulligans ?? 0).toString(),
          attempts: (attempts ?? 0).toString(),
          // Dates
          regstartdate: regstartdate ?? startdate,
          regenddate: regenddate ?? enddate,
          startdate: startdate,
          enddate: enddate,
          // Round 1 config (required)
          course1select: course1select.toString(),
          green1speed: (green1speed ?? 11).toString(),
          green1firmness: green1firmness ?? "Normal",
          fairway1firmness: fairway1firmness ?? "Normal",
          tees1: tees1 ?? "White",
          pins1: pins1 ?? "Thursday",
          wind1: wind1 ?? "Calm",
        };

        // Add round 2 config if present
        if (course2select && parseInt(numberrounds ?? "1") >= 2) {
          body.course2select = course2select.toString();
          body.green2speed = (green2speed ?? 11).toString();
          body.green2firmness = green2firmness ?? "Normal";
          body.fairway2firmness = fairway2firmness ?? "Normal";
          body.tees2 = tees2 ?? "White";
          body.pins2 = pins2 ?? "Friday";
          body.wind2 = wind2 ?? "Calm";
        }

        // Add round 3 config if present
        if (course3select && parseInt(numberrounds ?? "1") >= 3) {
          body.course3select = course3select.toString();
          body.green3speed = (green3speed ?? 11).toString();
          body.green3firmness = green3firmness ?? "Normal";
          body.fairway3firmness = fairway3firmness ?? "Normal";
          body.tees3 = tees3 ?? "White";
          body.pins3 = pins3 ?? "Saturday";
          body.wind3 = wind3 ?? "Calm";
        }

        // Add round 4 config if present
        if (course4select && parseInt(numberrounds ?? "1") >= 4) {
          body.course4select = course4select.toString();
          body.green4speed = (green4speed ?? 11).toString();
          body.green4firmness = green4firmness ?? "Normal";
          body.fairway4firmness = fairway4firmness ?? "Normal";
          body.tees4 = tees4 ?? "White";
          body.pins4 = pins4 ?? "Sunday";
          body.wind4 = wind4 ?? "Calm";
        }

        const response = await sgtRequest(clubUrl, "/tournaments/create", "POST", body) as { 
          success?: boolean; 
          feedback?: string; 
          tournamentId?: number 
        };

        if (response.success && response.tournamentId) {
          // Get course name from our database
          const { data: courseData } = await adminClient
            .from("sgt_courses")
            .select("name")
            .eq("course_id", course1select)
            .maybeSingle();

          // Add the tournament to our local database
          await adminClient
            .from("sgt_tournaments")
            .insert({
              tournament_id: response.tournamentId,
              tour_id: tourId,
              name: tournamentname,
              course_name: courseData?.name || null,
              start_date: startdate,
              end_date: enddate,
              status: "Upcoming",
            });
          
          console.log(`[SGT-MEMBER-MGMT] Created tournament: ${tournamentname} (ID: ${response.tournamentId})`);

          // Check if auto-register is enabled for this tour
          const { data: tourSettings } = await adminClient
            .from("sgt_tour_settings")
            .select("auto_register_tournaments")
            .eq("tour_id", tourId)
            .maybeSingle();

          if (tourSettings?.auto_register_tournaments) {
            // Delegate to sgt-tournament-auto-register: it is the only path that
            // applies each player's custom handicap (useCustomCap/customCap) and
            // skips players already registered. A raw /tournaments/add-member
            // call would enter everyone on SGT's combo handicap instead.
            console.log(`[SGT-MEMBER-MGMT] Delegating auto-registration for tournament ${response.tournamentId} to sgt-tournament-auto-register...`);
            try {
              const regRes = await fetch(
                `${Deno.env.get("SUPABASE_URL")}/functions/v1/sgt-tournament-auto-register`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    tournament_id: response.tournamentId,
                    tour_id: tourId,
                  }),
                },
              );
              console.log(`[SGT-MEMBER-MGMT] Auto-registration responded ${regRes.status}`);
            } catch (regError) {
              console.error("[SGT-MEMBER-MGMT] Auto-registration call failed:", regError);
            }
          }
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback,
          tournamentId: response.tournamentId 
        };
        break;
      }

      case "get-tournament-details": {
        // Get tournament details from SGT API
        const { tournamentId } = params;
        if (!tournamentId) throw new Error("tournamentId is required");

        const response = await sgtRequest(clubUrl, `/tournaments/details?tournament_id=${tournamentId}`);
        console.log(`[SGT-MEMBER-MGMT] Got tournament details for ID: ${tournamentId}`, response);
        
        result = response;
        break;
      }

      case "edit-tournament": {
        // Edit an existing tournament with full SGT API options
        const { 
          tournamentId,
          tournamentname, tourId, 
          // Tournament settings
          numberrounds, registrationon, statson, clubcombo, clubwgr, points, gameplay,
          stableford, numberholes, gimmes, puttingmode, head2head, hideleaderboard,
          skins, mulligans, attempts,
          // Dates
          regstartdate, regenddate, startdate, enddate,
          // Round 1 config
          course1select, green1speed, green1firmness, fairway1firmness, tees1, pins1, wind1,
          // Round 2 config (optional)
          course2select, green2speed, green2firmness, fairway2firmness, tees2, pins2, wind2,
          // Round 3 config (optional)
          course3select, green3speed, green3firmness, fairway3firmness, tees3, pins3, wind3,
          // Round 4 config (optional)
          course4select, green4speed, green4firmness, fairway4firmness, tees4, pins4, wind4,
        } = params;
        
        if (!tournamentId || !tournamentname || !tourId || !startdate || !enddate || !course1select) {
          throw new Error("tournamentId, tournamentname, tourId, startdate, enddate, and course1select are required");
        }

        // Build the request body with all SGT API parameters
        const body: Record<string, string> = {
          tournamentId: tournamentId.toString(),
          tourneyname: tournamentname,
          tourId: tourId.toString(),
          // Tournament settings
          numberrounds: (numberrounds ?? 1).toString(),
          registrationon: (registrationon ?? 1).toString(),
          statson: (statson ?? 1).toString(), // Include in WGR & tour statistics
          clubcombo: (clubcombo ?? 1).toString(),
          points: points ?? "Tour",
          gameplay: gameplay ?? "Normal",
          stableford: (stableford ?? 0).toString(),
          numberholes: numberholes ?? "18",
          gimmes: (gimmes ?? 0).toString(),
          puttingmode: puttingmode ?? "Optimistic",
          head2head: (head2head ?? 0).toString(),
          hideleaderboard: (hideleaderboard ?? 0).toString(),
          skins: (skins ?? 0).toString(),
          mulligans: (mulligans ?? 0).toString(),
          attempts: (attempts ?? 0).toString(),
          // Dates
          regstartdate: regstartdate ?? startdate,
          regenddate: regenddate ?? enddate,
          startdate: startdate,
          enddate: enddate,
          // Round 1 config (required)
          course1select: course1select.toString(),
          green1speed: (green1speed ?? 11).toString(),
          green1firmness: green1firmness ?? "Normal",
          fairway1firmness: fairway1firmness ?? "Normal",
          tees1: tees1 ?? "White",
          pins1: pins1 ?? "Thursday",
          wind1: wind1 ?? "Calm",
        };

        // Add round 2 config if present
        if (course2select && parseInt(numberrounds ?? "1") >= 2) {
          body.course2select = course2select.toString();
          body.green2speed = (green2speed ?? 11).toString();
          body.green2firmness = green2firmness ?? "Normal";
          body.fairway2firmness = fairway2firmness ?? "Normal";
          body.tees2 = tees2 ?? "White";
          body.pins2 = pins2 ?? "Friday";
          body.wind2 = wind2 ?? "Calm";
        }

        // Add round 3 config if present
        if (course3select && parseInt(numberrounds ?? "1") >= 3) {
          body.course3select = course3select.toString();
          body.green3speed = (green3speed ?? 11).toString();
          body.green3firmness = green3firmness ?? "Normal";
          body.fairway3firmness = fairway3firmness ?? "Normal";
          body.tees3 = tees3 ?? "White";
          body.pins3 = pins3 ?? "Saturday";
          body.wind3 = wind3 ?? "Calm";
        }

        // Add round 4 config if present
        if (course4select && parseInt(numberrounds ?? "1") >= 4) {
          body.course4select = course4select.toString();
          body.green4speed = (green4speed ?? 11).toString();
          body.green4firmness = green4firmness ?? "Normal";
          body.fairway4firmness = fairway4firmness ?? "Normal";
          body.tees4 = tees4 ?? "White";
          body.pins4 = pins4 ?? "Sunday";
          body.wind4 = wind4 ?? "Calm";
        }

        const response = await sgtRequest(clubUrl, "/tournaments/edit", "POST", body) as { 
          success?: boolean; 
          feedback?: string; 
        };

        if (response.success) {
          // Get course name from our database
          const { data: courseData } = await adminClient
            .from("sgt_courses")
            .select("name")
            .eq("course_id", course1select)
            .maybeSingle();

          // Update our local database
          await adminClient
            .from("sgt_tournaments")
            .update({
              name: tournamentname,
              course_name: courseData?.name || null,
              start_date: startdate,
              end_date: enddate,
            })
            .eq("tournament_id", tournamentId);
          
          console.log(`[SGT-MEMBER-MGMT] Updated tournament: ${tournamentname} (ID: ${tournamentId})`);
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback 
        };
        break;
      }

      case "close-tournament": {
        // Close/complete a tournament and assess tour standings points
        const { tournamentId, assessPoints } = params;
        if (!tournamentId) throw new Error("tournamentId is required");

        // IMPORTANT: assess_points MUST be "1" (string) to award tour standings points
        // The SGT API requires this parameter to update the overall tour leaderboard
        const shouldAssessPoints = assessPoints === false ? "0" : "1";
        console.log(`[SGT-MEMBER-MGMT] Closing tournament ${tournamentId} with assess_points=${shouldAssessPoints}`);

        const response = await sgtRequest(clubUrl, "/tournaments/close", "POST", {
          tournamentId: tournamentId.toString(),
          assess_points: shouldAssessPoints,
        }) as { success?: boolean; feedback?: string };
        
        console.log(`[SGT-MEMBER-MGMT] Close tournament response:`, JSON.stringify(response));

        if (response.success) {
          // Update our local database
          await adminClient
            .from("sgt_tournaments")
            .update({ status: "Completed" })
            .eq("tournament_id", tournamentId);
          
          console.log(`[SGT-MEMBER-MGMT] Closed tournament ID: ${tournamentId}`);
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback 
        };
        break;
      }

      case "delete-registration": {
        // Delete a player's registration for a tournament
        const { userId, tournamentId, tourId } = params;
        if (!userId || !tournamentId || !tourId) {
          throw new Error("userId, tournamentId, and tourId are required");
        }

        console.log(`[SGT-MEMBER-MGMT] Deleting registration for user ${userId} from tournament ${tournamentId}`);

        const response = await sgtRequest(clubUrl, "/registrations/delete", "POST", {
          user_id: userId.toString(),
          tournamentId: tournamentId.toString(),
          tourId: tourId.toString(),
        }) as { success?: boolean; feedback?: string };

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback 
        };
        break;
      }

      case "reset-member-to-pending": {
        // Remove a member from all tours (puts them back in pending state)
        // This also deletes their tournament registrations
        const { userId } = params;
        if (!userId) throw new Error("userId is required");

        console.log(`[SGT-MEMBER-MGMT] Resetting member ${userId} to pending state`);

        // Get all tours the member is in
        const { data: tourMemberships, error: tmError } = await adminClient
          .from("sgt_tour_members")
          .select("tour_id")
          .eq("user_id", userId);

        if (tmError) throw tmError;

        const deletedFromTours: number[] = [];
        const errors: string[] = [];

        // Get active tournaments for each tour and delete registrations
        for (const tm of tourMemberships || []) {
          try {
            // Get all non-closed tournaments for this tour
            const { data: tournaments } = await adminClient
              .from("sgt_tournaments")
              .select("tournament_id")
              .eq("tour_id", tm.tour_id)
              .in("status", ["Upcoming", "In Progress"]);

            // Delete registration from each tournament
            for (const t of tournaments || []) {
              try {
                await sgtRequest(clubUrl, "/registrations/delete", "POST", {
                  user_id: userId.toString(),
                  tournamentId: t.tournament_id.toString(),
                  tourId: tm.tour_id.toString(),
                });
                console.log(`[SGT-MEMBER-MGMT] Deleted registration for tournament ${t.tournament_id}`);
              } catch (regErr) {
                // May already be unregistered, log but continue
                console.log(`[SGT-MEMBER-MGMT] Could not delete from tournament ${t.tournament_id}:`, regErr);
              }
            }

            // Remove from tour via SGT API
            await sgtRequest(clubUrl, "/tours/remove-member", "POST", {
              user_id: userId.toString(),
              tour_id: tm.tour_id.toString(),
            });
            deletedFromTours.push(tm.tour_id);
          } catch (error) {
            errors.push(`Failed to remove from tour ${tm.tour_id}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        }

        // Delete from local sgt_tour_members table
        await adminClient
          .from("sgt_tour_members")
          .delete()
          .eq("user_id", userId);

        console.log(`[SGT-MEMBER-MGMT] Reset member ${userId}: removed from ${deletedFromTours.length} tours`);

        result = { 
          success: true, 
          deletedFromTours,
          errors: errors.length > 0 ? errors : undefined 
        };
        break;
      }


      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SGT-MEMBER-MGMT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
