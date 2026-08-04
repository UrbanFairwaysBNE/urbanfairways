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

  console.log(`[SGT-SYNC-ELIGIBLE] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
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

interface SGTMember {
  user_id: number;
  user_name: string;
  user_email?: string;
  user_active?: number;
}

interface EligibleMemberResult {
  email: string;
  name: string;
  membership_tier: string;
  sgt_user_id: number | null;
  action: string;
  club_added: boolean;
  tour_added: boolean;
  error?: string;
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

    console.log(`[SGT-SYNC-ELIGIBLE] Starting eligible member sync (dry_run: ${dryRun})`);

    const apiKey = await getApiKey(supabase);

    // 1. Get active tour
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

    console.log(`[SGT-SYNC-ELIGIBLE] Active tour: ${activeTour.name} (ID: ${activeTour.tourId})`);

    // 2. Get current SGT club members from API
    const clubMembersResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/members/list?api-key=${apiKey}`);
    const clubMembersData = await clubMembersResponse.json();
    const clubMembers = extractArray(clubMembersData, ['members', 'results']) as SGTMember[];

    // Create lookup maps - by email AND by username (lowercase)
    const clubMembersByEmail = new Map<string, SGTMember>();
    const clubMembersByUsername = new Map<string, SGTMember>();
    const clubMembersByUserId = new Set<number>();
    
    for (const member of clubMembers) {
      if (member.user_email) {
        clubMembersByEmail.set(member.user_email.toLowerCase(), member);
      }
      if (member.user_name) {
        clubMembersByUsername.set(member.user_name.toLowerCase(), member);
      }
      clubMembersByUserId.add(member.user_id);
    }

    console.log(`[SGT-SYNC-ELIGIBLE] SGT club has ${clubMembers.length} members`);

    // 3. Get current tour members from API
    const tourMembersResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/members?api-key=${apiKey}&tourId=${activeTour.tourId}`);
    const tourMembersData = await tourMembersResponse.json();
    const tourMembers = extractArray(tourMembersData, ['members', 'results']) as SGTMember[];
    const tourMemberIds = new Set(tourMembers.map(m => m.user_id));

    // 4. Get paying members (birdie/eagle) from our profiles
    const { data: payingMembers, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, display_name, membership_tier, sgt_user_id")
      .in("membership_tier", ["birdie", "eagle"]);

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    console.log(`[SGT-SYNC-ELIGIBLE] Found ${payingMembers?.length || 0} paying members (birdie/eagle)`);

    const results: EligibleMemberResult[] = [];
    let addedToClub = 0;
    let addedToTour = 0;
    let alreadyComplete = 0;
    let needsManualSetup = 0;

    // Build a map of names to potential user IDs from historical standings and scorecards
    const historicalUserMap = new Map<string, { user_id: number; source: string }>();
    
    // Check standings for historical names
    const { data: historicalStandings } = await supabase
      .from("sgt_tour_standings")
      .select("user_name")
      .order("tour_id", { ascending: false });
    
    // We can't get user_id from standings, but we can use it to match names

    for (const member of payingMembers || []) {
      const email = member.email.toLowerCase();
      const name = `${member.first_name} ${member.last_name}`;
      const result: EligibleMemberResult = {
        email: member.email,
        name,
        membership_tier: member.membership_tier,
        sgt_user_id: member.sgt_user_id,
        action: "",
        club_added: false,
        tour_added: false,
      };

      try {
        // Case 1: Member has sgt_user_id and is in club and tour - all good
        if (member.sgt_user_id && clubMembersByUserId.has(member.sgt_user_id) && tourMemberIds.has(member.sgt_user_id)) {
          result.action = "already_complete";
          alreadyComplete++;
          results.push(result);
          continue;
        }

        // Case 2: Member has sgt_user_id but missing from club or tour
        if (member.sgt_user_id) {
          const inClub = clubMembersByUserId.has(member.sgt_user_id);
          const inTour = tourMemberIds.has(member.sgt_user_id);

          if (!inClub && !dryRun) {
            // Re-add to club using SGT user_id
            const addClubForm = new URLSearchParams();
            addClubForm.append("api-key", apiKey);
            addClubForm.append("user_id", member.sgt_user_id.toString());

            const addClubResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/members/add`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: addClubForm.toString(),
            });

            const addClubData = await addClubResponse.json();
            result.club_added = addClubData.success === true;
            if (result.club_added) {
              addedToClub++;
              // Also re-add to local sgt_members if successful
              await supabase.from("sgt_members").upsert({
                user_id: member.sgt_user_id,
                user_name: name,
                user_email: member.email,
                user_active: 1,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' });
            }
            console.log(`[SGT-SYNC-ELIGIBLE] Added ${name} (sgt_user_id: ${member.sgt_user_id}) to club:`, addClubData);
          } else if (!inClub) {
            result.action = "would_add_to_club";
          }

          if (!inTour && !dryRun) {
            // Add to tour
            const addTourForm = new URLSearchParams();
            addTourForm.append("api-key", apiKey);
            addTourForm.append("tourId", activeTour.tourId.toString());
            addTourForm.append("user_id", member.sgt_user_id.toString());

            const addTourResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/add-member`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: addTourForm.toString(),
            });

            const addTourData = await addTourResponse.json();
            result.tour_added = addTourData.success === true;
            if (result.tour_added) addedToTour++;
            console.log(`[SGT-SYNC-ELIGIBLE] Added ${name} to tour:`, addTourData);

            // Also update local sgt_tour_members table
            if (result.tour_added) {
              await supabase.from("sgt_tour_members").upsert({
                tour_id: activeTour.tourId,
                user_id: member.sgt_user_id,
                user_name: name,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'tour_id,user_id' });
            }
          } else if (!inTour) {
            result.action = result.action ? result.action + "_and_tour" : "would_add_to_tour";
          } else if (inTour && !dryRun) {
            // SELF-HEAL: they're already in the SGT tour but our local row may have been
            // deleted by a past cleanup (loses custom_hcp -> registration falls back to Combo HCP).
            const { data: localRow } = await supabase
              .from("sgt_tour_members")
              .select("user_id, custom_hcp")
              .eq("tour_id", activeTour.tourId)
              .eq("user_id", member.sgt_user_id)
              .maybeSingle();

            if (!localRow) {
              const sgtRow = tourMembers.find(m => m.user_id === member.sgt_user_id) as
                (SGTMember & { custom_hcp?: number | null; hcp_index?: number | null }) | undefined;
              await supabase.from("sgt_tour_members").upsert({
                tour_id: activeTour.tourId,
                user_id: member.sgt_user_id,
                user_name: name,
                hcp_index: sgtRow?.hcp_index ?? null,
                custom_hcp: sgtRow?.custom_hcp ?? null,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'tour_id,user_id' });
              result.action = "restored_local_tour_row";
              console.log(`[SGT-SYNC-ELIGIBLE] Restored missing local tour row for ${name} (custom_hcp: ${sgtRow?.custom_hcp ?? 'null'})`);
            }
          }


          if (!result.action) {
            result.action = result.club_added || result.tour_added ? "re_added" : "already_complete";
          }
          
          results.push(result);
          continue;
        }

        // Case 3: No sgt_user_id - try to find by email in current SGT club
        const sgtMember = clubMembersByEmail.get(email);
        
        if (sgtMember) {
          // Found existing SGT member by email - re-link and ensure in tour
          result.sgt_user_id = sgtMember.user_id;
          result.action = "re_linked";

          if (!dryRun) {
            // Update profile with sgt_user_id
            await supabase
              .from("profiles")
              .update({ sgt_user_id: sgtMember.user_id })
              .eq("user_id", member.user_id);

            // Ensure they're in the local sgt_members table
            await supabase.from("sgt_members").upsert({
              user_id: sgtMember.user_id,
              user_name: sgtMember.user_name,
              user_email: sgtMember.user_email,
              user_active: sgtMember.user_active ?? 1,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

            result.club_added = true;

            // Check if in tour
            if (!tourMemberIds.has(sgtMember.user_id)) {
              const addTourForm = new URLSearchParams();
              addTourForm.append("api-key", apiKey);
              addTourForm.append("tourId", activeTour.tourId.toString());
              addTourForm.append("user_id", sgtMember.user_id.toString());

              const addTourResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/add-member`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: addTourForm.toString(),
              });

              const addTourData = await addTourResponse.json();
              result.tour_added = addTourData.success === true;
              if (result.tour_added) addedToTour++;
              console.log(`[SGT-SYNC-ELIGIBLE] Added ${name} to tour after re-link:`, addTourData);

              // Update local sgt_tour_members
              if (result.tour_added) {
                await supabase.from("sgt_tour_members").upsert({
                  tour_id: activeTour.tourId,
                  user_id: sgtMember.user_id,
                  user_name: sgtMember.user_name,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'tour_id,user_id' });
              }
            } else {
              result.tour_added = true; // Already in tour
            }

            addedToClub++;
            console.log(`[SGT-SYNC-ELIGIBLE] Re-linked ${name} (${email}) to SGT user ${sgtMember.user_id}`);
          }
        } else {
          // Case 4: Not in current SGT club by email - try matching by display_name as username
          const displayName = member.display_name?.toLowerCase();
          const firstNameMatch = displayName ? clubMembersByUsername.get(displayName) : undefined;
          
          if (firstNameMatch) {
            // Found by display name / username match
            result.sgt_user_id = firstNameMatch.user_id;
            result.action = "matched_by_username";
            console.log(`[SGT-SYNC-ELIGIBLE] Matched ${name} to SGT user ${firstNameMatch.user_name} (${firstNameMatch.user_id}) by display_name`);
            
            if (!dryRun) {
              // Update profile with sgt_user_id
              await supabase.from("profiles").update({ sgt_user_id: firstNameMatch.user_id }).eq("user_id", member.user_id);
              
              // Ensure they're in the local sgt_members table
              await supabase.from("sgt_members").upsert({
                user_id: firstNameMatch.user_id,
                user_name: firstNameMatch.user_name,
                user_email: firstNameMatch.user_email || member.email,
                user_active: firstNameMatch.user_active ?? 1,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id' });

              result.club_added = true;
              addedToClub++;

              // Check if in tour and add if not
              if (!tourMemberIds.has(firstNameMatch.user_id)) {
                const addTourForm = new URLSearchParams();
                addTourForm.append("api-key", apiKey);
                addTourForm.append("tourId", activeTour.tourId.toString());
                addTourForm.append("user_id", firstNameMatch.user_id.toString());

                const addTourResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/add-member`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: addTourForm.toString(),
                });

                const addTourData = await addTourResponse.json();
                result.tour_added = addTourData.success === true;
                if (result.tour_added) {
                  addedToTour++;
                  await supabase.from("sgt_tour_members").upsert({
                    tour_id: activeTour.tourId,
                    user_id: firstNameMatch.user_id,
                    user_name: firstNameMatch.user_name,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'tour_id,user_id' });
                }
              } else {
                result.tour_added = true;
              }
            }
          } else {
            // Check if they have historical scorecards
            const { data: historicalScorecards } = await supabase
              .from("sgt_scorecards")
              .select("player_id, player_name")
              .ilike("player_name", `%${member.first_name}%`)
              .limit(1);
            
            if (historicalScorecards && historicalScorecards.length > 0) {
              const historicalPlayer = historicalScorecards[0];
              result.sgt_user_id = historicalPlayer.player_id;
              result.action = "found_historical";
              console.log(`[SGT-SYNC-ELIGIBLE] Found historical SGT ID for ${name}: ${historicalPlayer.player_id} (${historicalPlayer.player_name})`);
              
              if (!dryRun) {
                // Try to re-add using historical user_id
                const addClubForm = new URLSearchParams();
                addClubForm.append("api-key", apiKey);
                addClubForm.append("user_id", historicalPlayer.player_id.toString());

                const addClubResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/members/add`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: addClubForm.toString(),
                });

                const addClubData = await addClubResponse.json();
                result.club_added = addClubData.success === true;
                
                if (result.club_added) {
                  addedToClub++;
                  
                  // Update profile with sgt_user_id
                  await supabase
                    .from("profiles")
                    .update({ sgt_user_id: historicalPlayer.player_id })
                    .eq("user_id", member.user_id);
                  
                  // Re-add to sgt_members
                  await supabase.from("sgt_members").upsert({
                    user_id: historicalPlayer.player_id,
                    user_name: historicalPlayer.player_name,
                    user_email: member.email,
                    user_active: 1,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'user_id' });
                  
                  // Add to tour
                  const addTourForm = new URLSearchParams();
                  addTourForm.append("api-key", apiKey);
                  addTourForm.append("tourId", activeTour.tourId.toString());
                  addTourForm.append("user_id", historicalPlayer.player_id.toString());

                  const addTourResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/add-member`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: addTourForm.toString(),
                  });

                  const addTourData = await addTourResponse.json();
                  result.tour_added = addTourData.success === true;
                  if (result.tour_added) {
                    addedToTour++;
                    await supabase.from("sgt_tour_members").upsert({
                      tour_id: activeTour.tourId,
                      user_id: historicalPlayer.player_id,
                      user_name: historicalPlayer.player_name,
                      updated_at: new Date().toISOString(),
                    }, { onConflict: 'tour_id,user_id' });
                  }
                }
                console.log(`[SGT-SYNC-ELIGIBLE] Re-added ${name} using historical ID:`, addClubData);
              }
            } else {
              // Not in SGT club and no historical data - need manual setup
              result.action = "needs_manual_setup";
              needsManualSetup++;
              console.log(`[SGT-SYNC-ELIGIBLE] ${name} (${email}) not found in SGT club or history - needs manual setup`);
            }
          }
        }

        results.push(result);

      } catch (error) {
        result.error = error instanceof Error ? error.message : "Unknown error";
        result.action = "error";
        results.push(result);
        console.error(`[SGT-SYNC-ELIGIBLE] Error processing ${name}:`, error);
      }

      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[SGT-SYNC-ELIGIBLE] Completed: ${addedToClub} club, ${addedToTour} tour, ${alreadyComplete} already OK, ${needsManualSetup} need manual setup`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        tour: activeTour.name,
        summary: {
          total_paying_members: payingMembers?.length || 0,
          already_complete: alreadyComplete,
          added_to_club: addedToClub,
          added_to_tour: addedToTour,
          needs_manual_setup: needsManualSetup,
        },
        results: results.filter(r => r.action !== "already_complete"), // Only show interesting results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-SYNC-ELIGIBLE] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
