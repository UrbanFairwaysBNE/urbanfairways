import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Points awarded by finish position (1st=25, 2nd=20, etc.)
const POINTS_TABLE: Record<number, number> = {
  1: 25, 2: 20, 3: 16, 4: 13, 5: 11,
  6: 10, 7: 9, 8: 8, 9: 7, 10: 6,
  11: 5, 12: 4, 13: 3, 14: 2,
};
const DEFAULT_POINTS = 1; // 15th and below

function getPoints(position: number): number {
  return POINTS_TABLE[position] ?? DEFAULT_POINTS;
}

// Minimum completed rounds to qualify for the monthly leaderboard
const MIN_ROUNDS = 2;

// Completed full rounds a player needs BEFORE a week starts for that week's
// results to count towards monthly points (their handicap is only "true"
// after 3 rounds, so points start accruing from their 4th round onwards).
const TRUE_HCP_ROUNDS = 3;

// =========================================================
// Calendar-month model (mirrors src/lib/league-block.ts).
// A tournament belongs to the calendar month of its Brisbane play
// day (Monday). We pad SGT tournaments by one day each end for the
// US timezone, so start_date is the Sunday before play day. We
// therefore bucket by start_date + 1 day.
// Label = "<MonthName> <Year>" e.g. "June 2026".
// =========================================================
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function labelForTournament(startDate: string): string {
  const [y, m, d] = startDate.slice(0, 10).split("-").map(Number);
  // Shift +1 day to land on the Brisbane play day (Monday)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 1));
  return `${MONTH_NAMES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

interface TournamentData {
  tournament_id: number;
  tour_id: number;
  start_date: string;
  status: string;
}

interface ScorecardRow {
  player_id: number;
  player_name: string;
  tournament_id: number;
  round: number | null;
  total_net: number | null;
  total_gross: number | null;
  to_par_net: number | null;
  to_par_gross: number | null;
  hole_data: Record<string, unknown> | null;
}

/** Count completed holes (score > 0) in hole_data for a given score type */
function countCompletedHoles(holeData: Record<string, unknown> | null, scoreType: "gross" | "net"): number {
  if (!holeData) return 0;
  let count = 0;
  for (let hole = 1; hole <= 18; hole++) {
    const key = `hole${hole}_${scoreType}`;
    const raw = holeData[key];
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(num) && num > 0) count++;
  }
  return count;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // --- Auth check (sync secret, service role, or admin user) ---
  const syncSecret = req.headers.get("x-sync-secret");
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  const authHeader = req.headers.get("Authorization");
  const token = authHeader ? authHeader.replace("Bearer ", "") : null;

  let authorized = false;
  if (expectedSecret && syncSecret === expectedSecret) authorized = true;
  if (!authorized && authenticateCronRequest(req) === null) {
    authorized = true;
    console.log("[MONTHLY-STANDINGS] Authorized via managed schedule");
  }
  if (!authorized && token && token === supabaseKey) {
    authorized = true;
    console.log("[MONTHLY-STANDINGS] Authorized via service role key");
  }
  if (!authorized && token) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser(token);
    if (user) {
      const { data: roles } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin");
      if (roles && roles.length > 0) {
        authorized = true;
        console.log(`[MONTHLY-STANDINGS] Triggered by admin: ${user.email}`);
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let targetMonth: string | null = null;
    let force = false;
    try {
      const body = await req.json();
      targetMonth = body?.month || null;
      force = body?.force === true;
    } catch { /* no body */ }

    console.log(`[MONTHLY-STANDINGS] Starting calculation${targetMonth ? ` for ${targetMonth}` : ""}${force ? " (FORCE)" : ""}...`);

    // Get active tour
    const { data: activeTour, error: tourError } = await supabase
      .from("sgt_tours").select("tour_id, name")
      .eq("active", 1).limit(1).maybeSingle();
    if (tourError || !activeTour) throw new Error("No active tour found");

    console.log(`[MONTHLY-STANDINGS] Tour: ${activeTour.name} (${activeTour.tour_id})`);

    // Get completed tournaments
    const { data: tournaments, error: tournErr } = await supabase
      .from("sgt_tournaments")
      .select("tournament_id, tour_id, start_date, status")
      .eq("tour_id", activeTour.tour_id)
      .eq("status", "Completed")
      .order("start_date", { ascending: false });

    if (tournErr) throw new Error(`Failed to fetch tournaments: ${tournErr.message}`);
    if (!tournaments || tournaments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No completed tournaments", monthsProcessed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup which months already have an awarded prize — these are
    // historical and must NEVER be recomputed (would corrupt records).
    const { data: awardedRows } = await supabase
      .from("sgt_monthly_awards")
      .select("month")
      .eq("tour_id", activeTour.tour_id);
    const awardedMonths = new Set((awardedRows ?? []).map(r => r.month));

    // Group tournaments by calendar-month label
    const tournamentsByMonth = new Map<string, TournamentData[]>();
    for (const t of tournaments as TournamentData[]) {
      if (!t.start_date) continue;
      const label = labelForTournament(t.start_date);
      if (targetMonth && label !== targetMonth) continue;
      // Skip already-awarded months unless explicitly forced or specifically targeted.
      if (!force && !targetMonth && awardedMonths.has(label)) continue;
      if (!tournamentsByMonth.has(label)) tournamentsByMonth.set(label, []);
      tournamentsByMonth.get(label)!.push(t);
    }

    console.log(`[MONTHLY-STANDINGS] ${tournamentsByMonth.size} months to process (skipped ${awardedMonths.size} awarded)`);
    let totalRecords = 0;

    for (const [month, monthTournaments] of tournamentsByMonth) {
      console.log(`[MONTHLY-STANDINGS] Processing ${month} (${monthTournaments.length} tournaments)`);
      const tournamentIds = monthTournaments.map(t => t.tournament_id);

      // Fetch scorecards with hole_data for completion checking
      const { data: scorecards, error: scErr } = await supabase
        .from("sgt_scorecards")
        .select("player_id, player_name, tournament_id, round, total_net, total_gross, to_par_net, to_par_gross, hole_data")
        .in("tournament_id", tournamentIds);

      if (scErr) { console.error(`[MONTHLY-STANDINGS] Scorecard error for ${month}:`, scErr); continue; }
      if (!scorecards || scorecards.length === 0) { console.log(`[MONTHLY-STANDINGS] No scorecards for ${month}`); continue; }

      // Group scorecards: tournament -> player -> rounds
      const tournamentPlayerRounds = new Map<number, Map<number, ScorecardRow[]>>();
      for (const sc of scorecards as ScorecardRow[]) {
        if (!tournamentPlayerRounds.has(sc.tournament_id)) tournamentPlayerRounds.set(sc.tournament_id, new Map());
        const playerMap = tournamentPlayerRounds.get(sc.tournament_id)!;
        if (!playerMap.has(sc.player_id)) playerMap.set(sc.player_id, []);
        playerMap.get(sc.player_id)!.push(sc);
      }

      interface TournamentResult {
        playerId: number;
        playerName: string;
        totalNet: number | null;
        totalGross: number | null;
        completedRounds: number;
      }

      const playerMonthlyData = new Map<number, {
        playerName: string;
        netPoints: number;
        grossPoints: number;
        tournamentsPlayed: number;
        totalCompletedRounds: number;
        bestNet: number;
        bestGross: number;
      }>();

      for (const tournamentId of tournamentIds) {
        const playerMap = tournamentPlayerRounds.get(tournamentId);
        if (!playerMap) continue;

        // Provisional players (fewer than TRUE_HCP_ROUNDS completed full rounds
        // BEFORE this week started) are exempt: they play, but earn no points
        // and don't affect anyone else's position.
        const exemptPlayers = new Set<number>();
        const { data: history, error: histErr } = await supabase
          .rpc("sgt_week_round_history", { p_tournament_id: tournamentId });
        if (histErr) {
          console.error(`[MONTHLY-STANDINGS] Round history error for ${tournamentId}:`, histErr);
        } else {
          for (const h of (history ?? []) as Array<{ player_id: number; prior_rounds: number }>) {
            if (Number(h.prior_rounds) < TRUE_HCP_ROUNDS) exemptPlayers.add(h.player_id);
          }
        }

        const results: TournamentResult[] = [];

        for (const [playerId, rounds] of playerMap) {
          if (exemptPlayers.has(playerId)) continue;

          let totalNet: number | null = null;
          let totalGross: number | null = null;
          let completedRounds = 0;

          for (const rd of rounds) {
            const netHoles = countCompletedHoles(rd.hole_data as Record<string, unknown> | null, "net");
            const isComplete = netHoles === 18;
            if (!isComplete) continue;

            completedRounds++;
            if (rd.to_par_net !== null) totalNet = (totalNet ?? 0) + rd.to_par_net;
            if (rd.to_par_gross !== null) totalGross = (totalGross ?? 0) + rd.to_par_gross;
          }

          if (completedRounds === 0) continue;

          results.push({
            playerId,
            playerName: rounds[0].player_name,
            totalNet,
            totalGross,
            completedRounds,
          });
        }

        if (results.length === 0) continue;

        const netRanked = [...results].filter(r => r.totalNet !== null)
          .sort((a, b) => a.totalNet! - b.totalNet!);
        const grossRanked = [...results].filter(r => r.totalGross !== null)
          .sort((a, b) => a.totalGross! - b.totalGross!);

        for (const r of results) {
          if (!playerMonthlyData.has(r.playerId)) {
            playerMonthlyData.set(r.playerId, {
              playerName: r.playerName,
              netPoints: 0,
              grossPoints: 0,
              tournamentsPlayed: 0,
              totalCompletedRounds: 0,
              bestNet: 999,
              bestGross: 999,
            });
          }
          const pd = playerMonthlyData.get(r.playerId)!;
          pd.tournamentsPlayed++;
          pd.totalCompletedRounds += r.completedRounds;

          const netPos = netRanked.findIndex(x => x.playerId === r.playerId) + 1;
          if (netPos > 0) pd.netPoints += getPoints(netPos);

          const grossPos = grossRanked.findIndex(x => x.playerId === r.playerId) + 1;
          if (grossPos > 0) pd.grossPoints += getPoints(grossPos);

          if (r.totalNet !== null) pd.bestNet = Math.min(pd.bestNet, r.totalNet);
          if (r.totalGross !== null) pd.bestGross = Math.min(pd.bestGross, r.totalGross);
        }
      }

      const qualified = Array.from(playerMonthlyData.entries())
        .filter(([, d]) => d.totalCompletedRounds >= MIN_ROUNDS);

      const netSorted = [...qualified].sort((a, b) => b[1].netPoints - a[1].netPoints);
      const grossSorted = [...qualified].sort((a, b) => b[1].grossPoints - a[1].grossPoints);

      // Replace standings for this block label
      await supabase
        .from("sgt_monthly_standings")
        .delete()
        .eq("tour_id", activeTour.tour_id)
        .eq("month", month);

      for (let i = 0; i < netSorted.length; i++) {
        const [playerId, data] = netSorted[i];
        const grossPos = grossSorted.findIndex(([pid]) => pid === playerId) + 1;

        const { error: upsertErr } = await supabase
          .from("sgt_monthly_standings")
          .insert({
            tour_id: activeTour.tour_id,
            month,
            player_id: playerId,
            player_name: data.playerName,
            total_net_score: data.netPoints,
            total_gross_score: data.grossPoints,
            monthly_net_points: data.netPoints,
            monthly_gross_points: data.grossPoints,
            tournaments_played: data.tournamentsPlayed,
            best_net: data.bestNet === 999 ? null : data.bestNet,
            best_gross: data.bestGross === 999 ? null : data.bestGross,
            net_position: i + 1,
            gross_position: grossPos,
            updated_at: new Date().toISOString(),
          });

        if (upsertErr) {
          console.error(`[MONTHLY-STANDINGS] Insert error:`, upsertErr);
        } else {
          totalRecords++;
        }
      }

      console.log(`[MONTHLY-STANDINGS] Inserted ${qualified.length} standings for ${month} (${qualified.length} qualified of ${playerMonthlyData.size} players)`);
    }

    console.log(`[MONTHLY-STANDINGS] ✓ Done. Total records: ${totalRecords}`);

    return new Response(JSON.stringify({
      success: true,
      totalRecords,
      monthsProcessed: tournamentsByMonth.size,
      tourId: activeTour.tour_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[MONTHLY-STANDINGS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
