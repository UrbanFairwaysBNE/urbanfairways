import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";
import { format } from "date-fns";
import venueLogo from "@/assets/venue-logo-mark.png";
import { useTenant } from "@/config/tenant";

export default function EmbedTVLocalComp() {
  const { tenant } = useTenant();
  // Fetch all completed/active comps to determine week number
  const { data: allComps } = useQuery({
    queryKey: ["tv-local-comp-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .in("status", ["active", "completed"])
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Fetch which comps actually have scores entered
  const { data: compsWithScores } = useQuery({
    queryKey: ["tv-local-comp-with-scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_teams")
        .select("competition_id, gross_score")
        .not("gross_score", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((t) => t.competition_id));
    },
    refetchInterval: 30000,
  });

  // Pick the latest comp that has scores; fall back to the most recent comp overall
  const competition = useMemo(() => {
    if (!allComps || allComps.length === 0) return null;
    if (compsWithScores && compsWithScores.size > 0) {
      for (let i = allComps.length - 1; i >= 0; i--) {
        if (compsWithScores.has(allComps[i].id)) return allComps[i];
      }
    }
    return allComps[allComps.length - 1];
  }, [allComps, compsWithScores]);

  const weekNumber = allComps && competition
    ? allComps.findIndex((c) => c.id === competition.id) + 1
    : null;

  const { data: teams } = useQuery({
    queryKey: ["tv-local-comp-teams", competition?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_teams")
        .select("*")
        .eq("competition_id", competition!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!competition?.id,
    refetchInterval: 30000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!competition?.id) return;
    const channel = supabase
      .channel("tv-local-comp")
      .on("postgres_changes", { event: "*", schema: "public", table: "local_comp_teams", filter: `competition_id=eq.${competition.id}` }, () => {})
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [competition?.id]);

  const sortedTeams = useMemo(() => {
    if (!teams) return [];
    return [...teams].sort((a, b) => {
      if (a.net_score === null && b.net_score === null) return 0;
      if (a.net_score === null) return 1;
      if (b.net_score === null) return -1;
      if (a.net_score === b.net_score) {
        const g = (a.gross_score || 999) - (b.gross_score || 999);
        if (g !== 0) return g;
        return (a.position || 999) - (b.position || 999);
      }
      return a.net_score - b.net_score;
    });
  }, [teams]);

  if (!competition) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <p className="text-white/50 text-2xl">No active competition</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(40,20%,95%)] p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <img src={venueLogo} alt={tenant.venue_name} className="h-16" />
          <div>
            <h1 className="font-bold text-4xl text-[hsl(220,4%,20%)] tracking-tight">
              AMBROSE COMP
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              {format(new Date(competition.date + "T00:00:00"), "EEEE dd MMMM yyyy")} · 2-Man Ambrose · ${competition.entry_fee} entry
            </p>
          </div>
        </div>
        <div className="text-right">
          {weekNumber && (
            <div className="px-6 py-3 bg-[hsl(32,62%,44%)] text-white rounded-lg text-xl font-bold">
              WEEK {weekNumber}
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="flex-1 bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] overflow-hidden shadow-lg">
        {/* Header Row */}
        <div className="grid grid-cols-12 gap-2 px-6 py-4 bg-[hsl(220,4%,20%)] text-xl font-bold text-white">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Team</div>
          <div className="col-span-3">Players</div>
          <div className="col-span-1 text-center">HCP</div>
          <div className="col-span-1 text-center">Gross</div>
          <div className="col-span-2 text-center">Net</div>
        </div>

        <div className="divide-y divide-[hsl(128,20%,85%)]">
          {sortedTeams.map((team, idx) => {
            const pos = team.position || idx + 1;
            const isWinner = idx === 0 && team.net_score !== null && competition.status === "completed";
            return (
              <div
                key={team.id}
                className={`grid grid-cols-12 gap-2 px-6 py-4 items-center ${
                  isWinner ? "bg-[hsl(37,100%,97%)]" : ""
                }`}
              >
                <div className="col-span-1 text-center text-2xl font-bold">
                  {isWinner ? <Trophy className="h-7 w-7 text-yellow-400 mx-auto" /> : (
                    <span className={pos <= 3 ? "text-[hsl(220,4%,20%)]" : "text-[hsl(128,20%,40%)]"}>{pos}</span>
                  )}
                </div>
                <div className="col-span-4">
                  <span className={`text-xl font-bold ${isWinner ? "text-[hsl(32,62%,44%)]" : "text-[hsl(220,4%,20%)]"}`}>
                    {team.team_name}
                  </span>
                </div>
                <div className="col-span-3 text-[hsl(128,20%,40%)] text-sm">
                  {team.player1_name} & {team.player2_name}
                </div>
                <div className="col-span-1 text-center text-[hsl(128,20%,40%)]">
                  {team.combined_handicap.toFixed(1)}
                </div>
                <div className="col-span-1 text-center text-lg text-[hsl(220,4%,20%)]">
                  {team.gross_score ?? "-"}
                </div>
                <div className="col-span-2 text-center">
                  <span className={`text-2xl font-bold ${isWinner ? "text-[hsl(32,62%,44%)]" : "text-[hsl(142,71%,45%)]"}`}>
                    {team.net_score !== null ? team.net_score : "-"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-lg text-[hsl(128,20%,40%)]">
        Live updates · Powered by {tenant.venue_name} League Hub
      </div>
    </div>
  );
}
