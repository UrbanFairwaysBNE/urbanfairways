import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import venueMark from "@/assets/venue-logo-mark-dark.png";
import { useIframeAutoResize } from "@/hooks/useIframeAutoResize";
import { useTenant } from "@/config/tenant";

export default function EmbedLocalCompLeaderboard() {
  const { tenant } = useTenant();
  useIframeAutoResize();
  const [selectedCompId, setSelectedCompId] = useState<string>("");

  // Fetch all competitions (oldest first for week numbering)
  const { data: competitionsAsc, isLoading: compsLoading } = useQuery({
    queryKey: ["embed-local-comp-comps"],
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

  const competitions = competitionsAsc ? [...competitionsAsc].reverse() : undefined;
  const getWeekNumber = (compId: string) => {
    if (!competitionsAsc) return null;
    const idx = competitionsAsc.findIndex((c) => c.id === compId);
    return idx >= 0 ? idx + 1 : null;
  };

  // Auto-select latest competition
  useEffect(() => {
    if (competitions && competitions.length > 0 && !selectedCompId) {
      setSelectedCompId(competitions[0].id);
    }
  }, [competitions, selectedCompId]);

  const selectedComp = competitions?.find((c) => c.id === selectedCompId);

  // Fetch teams for selected competition with auto-refresh
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["embed-local-comp-teams", selectedCompId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_teams")
        .select("*")
        .eq("competition_id", selectedCompId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCompId,
    refetchInterval: 30000,
  });

  // Realtime updates
  useEffect(() => {
    if (!selectedCompId) return;
    const channel = supabase
      .channel("embed-local-comp-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "local_comp_teams",
        filter: `competition_id=eq.${selectedCompId}`,
      }, () => {})
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompId]);

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

  const isLoading = compsLoading || teamsLoading;

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2: return <Medal className="h-5 w-5 text-gray-400" />;
      case 3: return <Award className="h-5 w-5 text-amber-600" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(40,29%,94%)] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src={venueMark} alt={tenant.venue_name} className="h-10" />
          <div>
            <h1 className="font-bold text-xl text-[hsl(218,13%,13%)]">AMBROSE COMP</h1>
            <p className="text-sm text-[hsl(128,20%,40%)]">2-Man Ambrose Results</p>
          </div>
        </div>
      </div>

      {/* Competition Selector */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {competitions && competitions.length > 0 && (
          <Select value={selectedCompId} onValueChange={setSelectedCompId}>
            <SelectTrigger className="w-full sm:w-[300px] bg-white border-[hsl(128,20%,85%)]">
              <SelectValue placeholder="Select competition" />
            </SelectTrigger>
            <SelectContent>
              {competitions.map((c) => {
                const wk = getWeekNumber(c.id);
                return (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <span>Week {wk}, {c.name}</span>
                      <span className="text-muted-foreground text-xs">
                        ({format(new Date(c.date + "T00:00:00"), "dd MMM")})
                      </span>
                      {competitions[0].id === c.id && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[hsl(93,15%,38%)] text-white rounded">
                          LATEST
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Competition Info */}
      {selectedComp && (
        <div className="mb-4">
          <p className="text-sm text-[hsl(128,20%,40%)]">
            {format(new Date(selectedComp.date + "T00:00:00"), "EEEE dd MMMM yyyy")} · ${selectedComp.entry_fee} entry
          </p>
        </div>
      )}

      {/* Leaderboard */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-[hsl(93,15%,38%)] animate-spin" />
        </div>
      ) : sortedTeams.length === 0 ? (
        <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] p-12 text-center">
          <h3 className="font-bold text-lg text-[hsl(218,13%,13%)] mb-2">NO RESULTS YET</h3>
          <p className="text-[hsl(128,20%,40%)]">Results will appear once scores are entered</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] overflow-hidden shadow-sm">
          {/* Desktop Header */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 bg-[hsl(218,13%,13%)] text-sm font-medium text-white">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-3">Team</div>
            <div className="col-span-3">Players</div>
            <div className="col-span-1 text-center">HCP</div>
            <div className="col-span-2 text-center">Gross</div>
            <div className="col-span-2 text-center">Net</div>
          </div>

          {/* Mobile Header */}
          <div className="grid sm:hidden grid-cols-12 gap-1 px-3 py-2 bg-[hsl(218,13%,13%)] text-xs font-medium text-white">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4">Team</div>
            <div className="col-span-2 text-center">HCP</div>
            <div className="col-span-2 text-center">Gross</div>
            <div className="col-span-3 text-center">Net</div>
          </div>

          <div className="divide-y divide-[hsl(128,20%,85%)]">
            {sortedTeams.map((team, idx) => {
              const pos = team.position || idx + 1;
              const isWinner = idx === 0 && team.net_score !== null;

              return (
                <div
                  key={team.id}
                  className={cn(
                    "grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 items-center hover:bg-[hsl(40,29%,97%)] transition-colors",
                    isWinner && "bg-[hsl(40,29%,97%)]"
                  )}
                >
                  <div className="col-span-1 flex items-center justify-center gap-0.5 sm:gap-1">
                    <span className="hidden sm:inline">{getPositionIcon(pos)}</span>
                    <span className={cn(
                      "font-bold text-xs sm:text-base",
                      pos <= 3 ? "text-[hsl(218,13%,13%)]" : "text-[hsl(128,20%,40%)]"
                    )}>
                      {pos}
                    </span>
                  </div>

                  {/* Desktop: Team + Players columns */}
                  <div className="hidden sm:block col-span-3">
                    <p className="font-semibold text-[hsl(218,13%,13%)] truncate">{team.team_name}</p>
                  </div>
                  <div className="hidden sm:block col-span-3">
                    <p className="text-sm text-[hsl(128,20%,40%)] truncate">
                      {team.player1_name} & {team.player2_name}
                    </p>
                  </div>

                  {/* Mobile: Combined team column */}
                  <div className="sm:hidden col-span-4">
                    <p className="font-semibold text-xs text-[hsl(218,13%,13%)] truncate">{team.team_name}</p>
                    <p className="text-[10px] text-[hsl(128,20%,40%)] truncate">
                      {team.player1_name} & {team.player2_name}
                    </p>
                  </div>

                  <div className="col-span-2 sm:col-span-1 text-center text-xs sm:text-sm text-[hsl(128,20%,40%)]">
                    {team.combined_handicap.toFixed(1)}
                  </div>

                  <div className="col-span-2 text-center text-xs sm:text-sm text-[hsl(128,20%,40%)]">
                    {team.gross_score ?? "-"}
                  </div>

                  <div className="col-span-3 sm:col-span-2 text-center">
                    <span className={cn(
                      "font-bold text-sm sm:text-base",
                      isWinner ? "text-[hsl(93,15%,38%)]" : "text-[hsl(218,13%,13%)]"
                    )}>
                      {team.net_score !== null ? team.net_score : "-"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-[hsl(128,20%,40%)]">
        Powered by {tenant.venue_name} League Hub • Live updates every 30 seconds
      </div>
    </div>
  );
}
