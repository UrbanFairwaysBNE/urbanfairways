import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Number of completed 18-hole rounds a player needs BEFORE a week starts for
 * that week's results to count.
 *
 * The custom handicap is calculated after 3 completed rounds, but tournament
 * weeks are 2 rounds long — so a player crosses that line mid-week and still
 * finishes round 4 on their onboarding handicap. Their official UF handicap
 * therefore applies from round 5 onward, and they stay exempt (E) for their
 * first 4 completed rounds. This rolls over as many weeks as it takes if they
 * only play one round some weeks.
 */
export const TRUE_HCP_ROUNDS = 4;

interface WeekRoundHistoryRow {
  player_id: number;
  player_name: string | null;
  prior_rounds: number;
}

/**
 * Returns the set of lowercase player names that are EXEMPT (provisional) for
 * the given tournament week — they still play, but can't win a prize until
 * they have a true handicap.
 */
export function useExemptPlayers(tournamentId: number | null) {
  const { data } = useQuery({
    queryKey: ["sgt-week-round-history", tournamentId],
    enabled: !!tournamentId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sgt_week_round_history", {
        p_tournament_id: tournamentId as number,
      });
      if (error) throw error;
      return (data ?? []) as WeekRoundHistoryRow[];
    },
  });

  const exemptNames = new Set<string>();
  for (const row of data ?? []) {
    if (Number(row.prior_rounds) < TRUE_HCP_ROUNDS && row.player_name) {
      exemptNames.add(row.player_name.trim().toLowerCase());
    }
  }

  return {
    exemptNames,
    isExempt: (playerName: string) =>
      exemptNames.has((playerName || "").trim().toLowerCase()),
  };
}
