// Custom HCP recalculator
// Runs weekly. A player's "true handicap" kicks in as soon as they have
// 3 completed 18-hole rounds: the average to-par-gross of their best 3
// rounds from their last 6, written to sgt_tour_members.custom_hcp.
// Members with < 3 rounds keep their onboarding_hcp (locked).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROUNDS_REQUIRED = 3; // rounds needed before a true handicap is calculated
const BEST_ROUNDS = 3;
const WINDOW_ROUNDS = 6; // most recent rounds considered
const HCP_MIN = -36;
const HCP_MAX = 36;

/**
 * Only FULL 18-hole rounds count towards the custom handicap.
 * Partial / abandoned rounds score artificially low against par and would
 * unfairly drag a handicap down.
 */
function isFullEighteen(sc: any): boolean {
  const holes = sc?.hole_data;
  if (holes && typeof holes === "object") {
    let scored = 0;
    for (let h = 1; h <= 18; h++) {
      const v = Number(holes[`hole${h}_gross`]);
      if (Number.isFinite(v) && v > 0) scored++;
    }
    return scored === 18;
  }
  // Fallback when hole data is missing: both nines must have a gross total
  return Number(sc?.in_gross) > 0 && Number(sc?.out_gross) > 0;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Check global toggle
    const { data: settings } = await supabase
      .from("sgt_handicap_settings")
      .select("use_custom_hcp, rounds_required, best_rounds_count")
      .eq("id", "global")
      .maybeSingle();

    if (!settings?.use_custom_hcp) {
      console.log("[SGT-RECALC] Custom HCP disabled globally - skipping recalc");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "custom_hcp disabled globally" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roundsRequired = settings.rounds_required ?? ROUNDS_REQUIRED;
    const bestRounds = settings.best_rounds_count ?? BEST_ROUNDS;

    // Get all distinct onboarded members
    const { data: tourMembers, error: tmError } = await supabase
      .from("sgt_tour_members")
      .select("user_id, user_name, onboarding_hcp");

    if (tmError) throw tmError;
    if (!tourMembers || tourMembers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No tour members" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Dedupe by user_id
    const uniqueMembers = new Map<number, { user_id: number; user_name: string | null; onboarding_hcp: number | null }>();
    for (const tm of tourMembers) {
      if (!uniqueMembers.has(tm.user_id)) {
        uniqueMembers.set(tm.user_id, tm);
      }
    }

    const summary: Array<{ user_id: number; user_name: string | null; old_hcp: number | null; new_hcp: number | null; rounds: number; status: string }> = [];

    for (const member of uniqueMembers.values()) {
      // Pull a wide window of scorecards, then keep only FULL 18-hole rounds.
      // Partial / abandoned rounds must never influence the handicap.
      const { data: rawCards } = await supabase
        .from("sgt_scorecards")
        .select("to_par_gross, total_gross, in_gross, out_gross, hole_data, created_at")
        .eq("player_id", member.user_id)
        .not("total_gross", "is", null)
        .not("to_par_gross", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);

      const scorecards = (rawCards ?? [])
        .filter((sc: any) => isFullEighteen(sc))
        .slice(0, WINDOW_ROUNDS);

      const roundsPlayed = scorecards.length;


      // LOCKED: not enough rounds yet — keep onboarding_hcp
      if (roundsPlayed < roundsRequired) {
        if (member.onboarding_hcp !== null) {
          await supabase
            .from("sgt_tour_members")
            .update({ custom_hcp: member.onboarding_hcp, updated_at: new Date().toISOString() })
            .eq("user_id", member.user_id);
        }
        summary.push({
          user_id: member.user_id,
          user_name: member.user_name,
          old_hcp: member.onboarding_hcp,
          new_hcp: member.onboarding_hcp,
          rounds: roundsPlayed,
          status: `locked (${roundsPlayed}/${roundsRequired})`,
        });
        continue;
      }

      // UNLOCKED: average of the best N rounds within the last WINDOW_ROUNDS
      const toPars = scorecards.map((s: any) => Number(s.to_par_gross)).sort((a, b) => a - b);
      const best = toPars.slice(0, Math.min(bestRounds, toPars.length));
      const avgToPar = best.reduce((a, b) => a + b, 0) / best.length;

      // Round to 1 decimal and clamp
      let newHcp = Math.round(avgToPar * 10) / 10;
      newHcp = Math.max(HCP_MIN, Math.min(HCP_MAX, newHcp));

      const { error: updateError } = await supabase
        .from("sgt_tour_members")
        .update({ custom_hcp: newHcp, updated_at: new Date().toISOString() })
        .eq("user_id", member.user_id);

      if (updateError) {
        console.error(`[SGT-RECALC] Failed to update ${member.user_name}:`, updateError);
        summary.push({
          user_id: member.user_id,
          user_name: member.user_name,
          old_hcp: null,
          new_hcp: null,
          rounds: roundsPlayed,
          status: `error: ${updateError.message}`,
        });
        continue;
      }

      summary.push({
        user_id: member.user_id,
        user_name: member.user_name,
        old_hcp: null,
        new_hcp: newHcp,
        rounds: roundsPlayed,
        status: `recalculated (best ${Math.min(bestRounds, roundsPlayed)} of last ${roundsPlayed})`,
      });
    }

    console.log(`[SGT-RECALC] Processed ${summary.length} members`);

    return new Response(
      JSON.stringify({ success: true, processed: summary.length, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[SGT-RECALC] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
