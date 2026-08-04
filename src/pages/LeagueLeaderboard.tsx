import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { useSGTTournamentStandings } from "@/hooks/useSGTEmbedData";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import { Loader2, Trophy, Medal, Award, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentBlockLabel } from "@/lib/league-block";
import { TournamentStatsView } from "@/components/sgt/TournamentStatsView";
import { useExemptPlayers, TRUE_HCP_ROUNDS } from "@/hooks/useExemptPlayers";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function ExemptBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground align-middle">
            E
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Exempt — still setting their true handicap ({TRUE_HCP_ROUNDS} rounds).
          They take part but aren't eligible for prizes or monthly points yet.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MonthlyStanding {
  id: string;
  player_name: string;
  player_id: number;
  net_position: number | null;
  gross_position: number | null;
  total_net_score: number | null;
  total_gross_score: number | null;
  monthly_net_points: number | null;
  monthly_gross_points: number | null;
  best_net: number | null;
  best_gross: number | null;
  tournaments_played: number;
}

export default function LeagueLeaderboard() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>("");
  const [scoreType, setScoreType] = useState<"gross" | "net">("net");
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [activeTab, setActiveTab] = useState<"monthly" | "weekly">("weekly");
  const [weeklyView, setWeeklyView] = useState<"scores" | "stats">("scores");
  const [monthlyStandings, setMonthlyStandings] = useState<MonthlyStanding[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const INITIAL_WEEKS_TO_SHOW = 5;

  // Get active tour and tournaments automatically
  const { activeTour, currentTournament, tournaments, isLoading: tourLoading } = useActiveTourData();
  
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);

  // Set initial tournament to the current tournament when data loads
  useEffect(() => {
    if (currentTournament && !selectedTournament) {
      setSelectedTournament(currentTournament.tournament_id);
    } else if (tournaments.length > 0 && !selectedTournament && !currentTournament) {
      setSelectedTournament(tournaments[0].tournament_id);
    }
  }, [tournaments, currentTournament, selectedTournament]);

  // Fetch monthly standings
  useEffect(() => {
    if (!activeTour || activeTab !== "monthly") return;
    
    async function fetchMonthlyStandings() {
      setMonthlyLoading(true);
      const monthStr = getCurrentBlockLabel();
      
      const { data, error } = await supabase
        .from("sgt_monthly_standings")
        .select("*")
        .eq("tour_id", activeTour.tour_id)
        .eq("month", monthStr)
        .order(scoreType === "net" ? "net_position" : "gross_position", { ascending: true });
      
      if (!error && data) {
        setMonthlyStandings(data);
      }
      setMonthlyLoading(false);
    }
    
    fetchMonthlyStandings();
  }, [activeTour, activeTab, scoreType]);

  const { 
    standings: tournamentStandings, 
    isLoading: tournamentStandingsLoading,
  } = useSGTTournamentStandings({
    id: selectedTournament,
    scoreType,
    enabled: !!selectedTournament && activeTab === "weekly",
    refreshInterval: 30000,
  });

  const { isExempt } = useExemptPlayers(activeTab === "weekly" ? selectedTournament : null);



  const isLoading = tourLoading || (activeTab === "weekly" ? tournamentStandingsLoading : monthlyLoading);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadDisplayName() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      
      setDisplayName(profile?.display_name || "");
    }
    loadDisplayName();
  }, [authLoading, user]);

  if (authLoading || !user || tourLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-secondary animate-spin" />
      </div>
    );
  }

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2: return <Medal className="h-5 w-5 text-gray-400" />;
      case 3: return <Award className="h-5 w-5 text-amber-600" />;
      default: return null;
    }
  };

  const getScoreColor = (score: string) => {
    if (score === "-" || score === "") return "";
    if (score === "E") return "text-foreground";
    if (score.startsWith("-")) return "text-green-600";
    return "text-blue-600";
  };

  // Filter tournaments for the active tour only
  const filteredTournaments = activeTour 
    ? tournaments.filter(t => t.tour_id === activeTour.tour_id)
    : tournaments;

  const currentMonth = getCurrentBlockLabel();

  return (
    <LeagueLayout>
      <div className="mb-6 animate-fade-in">
        <h1 className="font-display text-3xl md:text-4xl text-foreground mb-2">
          LEADERBOARD
        </h1>
        <p className="font-inter text-muted-foreground">
          See how you compare to other League Hub players
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "monthly" | "weekly")} className="mb-6">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted">
          <TabsTrigger value="monthly" className="font-inter">Monthly Winner</TabsTrigger>
          <TabsTrigger value="weekly" className="font-inter">Weekly Results</TabsTrigger>
        </TabsList>

        {/* Monthly Winner Tab */}
        <TabsContent value="monthly" className="mt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 animate-slide-up">
            <div className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-inter text-foreground">{currentMonth}</span>
            </div>

            <div className="flex-1 flex justify-center sm:justify-end">
              <div className="flex rounded-full bg-muted overflow-hidden">
                <button
                  onClick={() => setScoreType("gross")}
                  className={cn(
                    "px-4 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                    scoreType === "gross"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Gross
                </button>
                <button
                  onClick={() => setScoreType("net")}
                  className={cn(
                    "px-4 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                    scoreType === "net"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Net
                </button>
              </div>
            </div>
          </div>

          {monthlyLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-secondary animate-spin" />
            </div>
          ) : monthlyStandings.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center animate-fade-in">
              <h3 className="font-display text-xl text-foreground mb-2">NO RESULTS YET</h3>
              <p className="text-muted-foreground font-inter">
                Monthly standings will appear once tournaments are completed this month
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden animate-slide-up">
              <div className="px-4 py-3 bg-primary/10 border-b border-border">
                <h3 className="font-display text-lg text-foreground">
                  {currentMonth} - Monthly Medal
                </h3>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 border-b border-border font-inter text-sm font-medium text-muted-foreground">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-5">Player</div>
                <div className="col-span-2 text-center">Played</div>
                <div className="col-span-2 text-center">Best</div>
                <div className="col-span-2 text-center">Points</div>
              </div>

              <div className="divide-y divide-border">
                {monthlyStandings.map((standing, index) => {
                  const position = scoreType === "net" ? standing.net_position : standing.gross_position;
                  const points = scoreType === "net" ? (standing.monthly_net_points ?? standing.total_net_score) : (standing.monthly_gross_points ?? standing.total_gross_score);
                  const best = scoreType === "net" ? standing.best_net : standing.best_gross;
                  const isCurrentPlayer = displayName && standing.player_name.toLowerCase() === displayName.toLowerCase();

                  return (
                    <div
                      key={standing.id}
                      className={cn(
                        "grid grid-cols-12 gap-4 px-4 py-4 items-center transition-colors",
                        isCurrentPlayer && "bg-secondary/10 border-l-4 border-secondary",
                        !isCurrentPlayer && "hover:bg-muted/30"
                      )}
                    >
                      <div className="col-span-1 flex items-center justify-center gap-2">
                        {getPositionIcon(position || index + 1)}
                        <span className={cn(
                          "font-display text-lg",
                          (position || 0) <= 3 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {position || index + 1}
                        </span>
                      </div>

                      <div className="col-span-5 flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-display text-lg",
                          isCurrentPlayer
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-primary text-primary-foreground"
                        )}>
                          {standing.player_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className={cn(
                            "font-inter font-semibold",
                            isCurrentPlayer ? "text-secondary" : "text-foreground"
                          )}>
                            {standing.player_name}
                            {isCurrentPlayer && <span className="text-xs ml-2">(You)</span>}
                          </p>
                        </div>
                      </div>

                      <div className="col-span-2 text-center font-inter">
                        {standing.tournaments_played}
                      </div>

                      <div className="col-span-2 text-center font-inter">
                        {best ?? "-"}
                      </div>

                      <div className="col-span-2 text-center">
                        <span className="font-display text-lg text-brand-accent">
                          {points ?? "-"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Weekly Results Tab */}
        <TabsContent value="weekly" className="mt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 animate-slide-up">
            {filteredTournaments.length > 0 && (
              <Select
                value={selectedTournament?.toString()}
                onValueChange={(val) => setSelectedTournament(parseInt(val))}
              >
                <SelectTrigger className="w-full sm:w-[350px] font-inter">
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  {(showAllWeeks ? filteredTournaments : filteredTournaments.slice(0, INITIAL_WEEKS_TO_SHOW)).map((tournament, index) => (
                    <SelectItem key={tournament.tournament_id} value={tournament.tournament_id.toString()}>
                      <div className="flex items-center gap-2">
                        <span>{tournament.name}</span>
                        {currentTournament && tournament.tournament_id === currentTournament.tournament_id && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground rounded">
                            CURRENT
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {filteredTournaments.length > INITIAL_WEEKS_TO_SHOW && (
                    <div
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground font-inter text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllWeeks(!showAllWeeks);
                      }}
                    >
                      {showAllWeeks ? "Show less" : `Show ${filteredTournaments.length - INITIAL_WEEKS_TO_SHOW} more weeks...`}
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}

            <div className="flex-1 flex justify-center sm:justify-end">
              <div className="flex rounded-full bg-muted overflow-hidden">
                <button
                  onClick={() => setScoreType("gross")}
                  className={cn(
                    "px-4 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                    scoreType === "gross"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Gross
                </button>
                <button
                  onClick={() => setScoreType("net")}
                  className={cn(
                    "px-4 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                    scoreType === "net"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Net
                </button>
              </div>
            </div>
          </div>

          {/* Scores vs Stats sub-tabs */}
          <div className="flex justify-center mb-6">
            <div className="flex rounded-full bg-muted overflow-hidden">
              <button
                onClick={() => setWeeklyView("scores")}
                className={cn(
                  "px-6 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                  weeklyView === "scores"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Scores
              </button>
              <button
                onClick={() => setWeeklyView("stats")}
                className={cn(
                  "px-6 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                  weeklyView === "stats"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Stats
              </button>
            </div>
          </div>

          {weeklyView === "stats" ? (
            <div className="bg-card rounded-xl border border-border p-4 sm:p-6 animate-slide-up">
              {selectedTournament ? (
                <TournamentStatsView
                  tournamentId={selectedTournament}
                  isCompleted={
                    filteredTournaments.find((t) => t.tournament_id === selectedTournament)
                      ?.status === "Completed"
                  }
                />
              ) : (
                <p className="text-center text-muted-foreground py-12 font-inter">
                  Select a week to view stats.
                </p>
              )}
            </div>
          ) : tournamentStandingsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-secondary animate-spin" />
            </div>
          ) : tournamentStandings.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center animate-fade-in">
              <h3 className="font-display text-xl text-foreground mb-2">NO RESULTS YET</h3>
              <p className="text-muted-foreground font-inter">
                {filteredTournaments.length === 0
                  ? "No tournaments available yet"
                  : "No results available for this tournament"
                }
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden animate-slide-up">
              {/* Tournament Info Header */}
              {selectedTournament && filteredTournaments.find(t => t.tournament_id === selectedTournament) && (
                <div className="px-4 py-3 bg-primary/10 border-b border-border">
                  <h3 className="font-display text-lg text-foreground">
                    {filteredTournaments.find(t => t.tournament_id === selectedTournament)?.name}
                  </h3>
                  <p className="font-inter text-sm text-muted-foreground">
                    {filteredTournaments.find(t => t.tournament_id === selectedTournament)?.course_name}
                  </p>
                </div>
              )}

              <div className="px-4 py-2 border-b border-border bg-muted/20 font-inter text-xs text-muted-foreground">
                <span className="font-bold text-foreground">E</span> = Exempt — new
                players are still setting their true handicap over their first{" "}
                {TRUE_HCP_ROUNDS} rounds. They play, but aren't eligible for prizes
                or monthly points until week three.
              </div>



              {/* Table Header - Mobile */}
              <div className="grid md:hidden grid-cols-12 gap-4 px-4 py-2 bg-muted/50 border-b border-border font-inter text-xs font-medium text-muted-foreground">
                <div className="col-span-2 text-center">#</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-center">R1</div>
                <div className="col-span-2 text-center">R2</div>
                <div className="col-span-2 text-center">+/-</div>
              </div>

              {/* Table Header - Desktop */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 border-b border-border font-inter text-sm font-medium text-muted-foreground">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-center">R1</div>
                <div className="col-span-2 text-center">R2</div>
                <div className="col-span-1 text-center">Total</div>
                <div className="col-span-2 text-center">To Par</div>
              </div>

              <div className="divide-y divide-border">
                {tournamentStandings.map((result, index) => {
                  const isCurrentPlayer = displayName && result.playerName.toLowerCase() === displayName.toLowerCase();
                  const playerExempt = isExempt(result.playerName);

                  return (
                    <div
                      key={result.playerName}
                      className={cn(
                        "grid grid-cols-12 gap-4 px-4 py-4 items-center transition-colors",
                        isCurrentPlayer && "bg-secondary/10 border-l-4 border-secondary",
                        !isCurrentPlayer && "hover:bg-muted/30"
                      )}
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {/* Mobile Layout */}
                      <div className="col-span-2 md:hidden flex items-center justify-center gap-1">
                        {getPositionIcon(result.position)}
                        <span className={cn(
                          "font-display text-lg",
                          result.position <= 3 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {result.position}
                        </span>
                      </div>

                      <div className="col-span-4 md:hidden flex items-center gap-2">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-display text-sm",
                          isCurrentPlayer
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-primary text-primary-foreground"
                        )}>
                          {result.playerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className={cn(
                            "font-inter text-sm font-semibold truncate",
                            isCurrentPlayer ? "text-secondary" : "text-foreground"
                          )}>
                            {result.playerName}
                            {playerExempt && <ExemptBadge />}
                            {isCurrentPlayer && <span className="text-xs ml-1">(You)</span>}
                          </p>
                          <p className="font-inter text-xs text-muted-foreground">
                            HCP: {result.hcp ?? "-"}
                          </p>
                        </div>
                      </div>

                      <div className="col-span-2 md:hidden text-center">
                        <span className={cn("font-inter text-sm", getScoreColor(result.r1))}>
                          {result.r1}
                        </span>
                        {result.r1Thru && (
                          <div className="text-[10px] text-muted-foreground">
                            {result.r1Thru === "F" ? "F" : `Thru ${result.r1Thru}`}
                          </div>
                        )}
                      </div>

                      <div className="col-span-2 md:hidden text-center">
                        <span className={cn("font-inter text-sm", getScoreColor(result.r2))}>
                          {result.r2}
                        </span>
                        {result.r2Thru && (
                          <div className="text-[10px] text-muted-foreground">
                            {result.r2Thru === "F" ? "F" : `Thru ${result.r2Thru}`}
                          </div>
                        )}
                      </div>

                      <div className="col-span-2 md:hidden text-center">
                        <span className={cn(
                          "px-2 py-1 rounded font-medium text-sm",
                          result.toPar.startsWith("-") && "bg-green-100 text-green-700",
                          result.toPar === "E" && "bg-muted text-foreground",
                          result.toPar.startsWith("+") && "bg-blue-100 text-blue-700",
                        )}>
                          {result.toPar}
                        </span>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden md:flex col-span-1 items-center justify-center gap-2">
                        {getPositionIcon(result.position)}
                        <span className={cn(
                          "font-display text-lg",
                          result.position <= 3 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {result.position}
                        </span>
                      </div>

                      <div className="hidden md:flex col-span-4 items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-display text-lg",
                          isCurrentPlayer
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-primary text-primary-foreground"
                        )}>
                          {result.playerName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className={cn(
                            "font-inter font-semibold",
                            isCurrentPlayer ? "text-secondary" : "text-foreground"
                          )}>
                            {result.playerName}
                            {playerExempt && <ExemptBadge />}
                            <span className="text-muted-foreground font-normal ml-1">
                              ({result.hcp ?? "-"})
                            </span>
                            {isCurrentPlayer && <span className="text-xs ml-2">(You)</span>}
                          </p>
                        </div>
                      </div>

                      <div className="hidden md:block col-span-2 text-center">
                        <span className={cn("font-inter", getScoreColor(result.r1))}>
                          {result.r1}
                        </span>
                        {result.r1Thru && (
                          <span className="text-xs text-muted-foreground ml-1">
                            {result.r1Thru === "F" ? "F" : `(${result.r1Thru})`}
                          </span>
                        )}
                      </div>

                      <div className="hidden md:block col-span-2 text-center">
                        <span className={cn("font-inter", getScoreColor(result.r2))}>
                          {result.r2}
                        </span>
                        {result.r2Thru && (
                          <span className="text-xs text-muted-foreground ml-1">
                            {result.r2Thru === "F" ? "F" : `(${result.r2Thru})`}
                          </span>
                        )}
                      </div>

                      <div className="hidden md:block col-span-1 text-center font-display text-lg">
                        {result.total}
                      </div>

                      <div className="hidden md:block col-span-2 text-center">
                        <span className={cn(
                          "px-3 py-1 rounded-lg font-display text-lg",
                          result.toPar.startsWith("-") && "bg-green-100 text-green-700",
                          result.toPar === "E" && "bg-muted text-foreground",
                          result.toPar.startsWith("+") && "bg-blue-100 text-blue-700",
                        )}>
                          {result.toPar}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


        </TabsContent>
      </Tabs>
    </LeagueLayout>
  );
}
