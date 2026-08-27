import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Medal, Award, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

export default function CompLeaderboard() {
  const navigate = useNavigate();
  const { t } = useTranslation(["league", "common"]);
  const [selectedCompId, setSelectedCompId] = useState<string>("");

  // Fetch all competitions (completed + active, oldest first for week numbering)
  const { data: competitionsAsc, isLoading: compsLoading } = useQuery({
    queryKey: ["comp-leaderboard-comps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .in("status", ["active", "completed"])
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Reverse for display (most recent first) but keep asc order for week numbering
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
    queryKey: ["comp-leaderboard-teams", selectedCompId],
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
    <div className="min-h-screen bg-background safe-area-top">
      <div className="max-w-lg mx-auto p-4 pt-6 space-y-4">
        <button
          onClick={() => navigate("/comp")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("league:comp.leaderboard.backToCompArea")}
        </button>

        <div>
          <h1 className="font-display text-2xl text-primary font-bold">{t("league:comp.leaderboard.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("league:comp.leaderboard.subtitle")}</p>
        </div>

        {/* Competition Selector */}
        {competitions && competitions.length > 0 && (
          <Select value={selectedCompId} onValueChange={setSelectedCompId}>
            <SelectTrigger className="w-full bg-card border-border">
              <SelectValue placeholder={t("league:comp.leaderboard.selectCompetition")} />
            </SelectTrigger>
            <SelectContent>
              {competitions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground text-xs">
                      ({format(new Date(c.date + "T00:00:00"), "dd MMM yyyy")})
                    </span>
                    {competitions[0].id === c.id && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent text-accent-foreground rounded">
                        {t("league:comp.leaderboard.latest")}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Competition Info */}
        {selectedComp && (
          <div className="text-center py-2">
            <div className="inline-block px-2 py-0.5 bg-accent text-accent-foreground text-xs font-bold rounded mb-1">
              {t("league:comp.leaderboard.week", { number: getWeekNumber(selectedComp.id) })}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
          </div>
        ) : sortedTeams.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="font-bold text-lg text-foreground mb-1">{t("league:comp.leaderboard.noResultsTitle")}</h3>
            <p className="text-muted-foreground text-sm">{t("league:comp.leaderboard.noResultsBody")}</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-primary text-sm font-medium text-primary-foreground">
              <div className="col-span-1 text-center">{t("league:leaderboard.colPosition")}</div>
              <div className="col-span-4">{t("league:comp.leaderboard.colTeam")}</div>
              <div className="col-span-2 text-center">{t("league:comp.leaderboard.colHcp")}</div>
              <div className="col-span-2 text-center">{t("league:comp.leaderboard.colGross")}</div>
              <div className="col-span-3 text-center">{t("league:comp.leaderboard.colNet")}</div>
            </div>

            <div className="divide-y divide-border">
              {sortedTeams.map((team, idx) => {
                const pos = team.position || idx + 1;
                const isWinner = idx === 0 && team.net_score !== null;

                return (
                  <div
                    key={team.id}
                    className={cn(
                      "grid grid-cols-12 gap-1 px-3 py-3 items-center",
                      isWinner && "bg-accent/10"
                    )}
                  >
                    <div className="col-span-1 flex items-center justify-center gap-0.5">
                      {getPositionIcon(pos)}
                      <span className={cn(
                        "font-bold text-sm",
                        pos <= 3 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {pos}
                      </span>
                    </div>

                    <div className="col-span-4">
                      <p className="font-semibold text-sm text-foreground truncate">{team.team_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {team.player1_name} & {team.player2_name}
                      </p>
                    </div>

                    <div className="col-span-2 text-center text-sm text-muted-foreground">
                      {team.combined_handicap.toFixed(1)}
                    </div>

                    <div className="col-span-2 text-center text-sm text-muted-foreground">
                      {team.gross_score ?? "-"}
                    </div>

                    <div className="col-span-3 text-center">
                      <span className={cn(
                        "font-bold text-base",
                        isWinner ? "text-accent" : "text-foreground"
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
        <div className="text-center text-xs text-muted-foreground pb-4">
          {t("league:comp.leaderboard.autoUpdates")}
        </div>
      </div>
    </div>
  );
}
