import { useEffect, useState } from "react";
import { Trophy, Medal, Award, Loader2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSGTTournamentStandings } from "@/hooks/useSGTEmbedData";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import { supabase } from "@/integrations/supabase/client";
import { useSgtNicknames } from "@/hooks/useSgtNicknames";
import venueMark from "@/assets/venue-logo-mark-dark.png";
import { useIframeAutoResize } from "@/hooks/useIframeAutoResize";
import { useTenant } from "@/config/tenant";

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
  hcp: number | null;
}

export default function EmbedLeaderboard() {
  const { nick } = useSgtNicknames();
  const { tenant } = useTenant();
  useIframeAutoResize();
  const { activeTour, currentTournament, tournaments, isLoading: dataLoading } = useActiveTourData();
  
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);
  const [scoreType, setScoreType] = useState<"gross" | "net">("net");
  const [activeTab, setActiveTab] = useState<"monthly" | "weekly">("weekly");
  const [monthlyStandings, setMonthlyStandings] = useState<MonthlyStanding[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // Initialize selection when data loads
  useEffect(() => {
    if (currentTournament && !selectedTournament) {
      setSelectedTournament(currentTournament.tournament_id);
    }
  }, [currentTournament, selectedTournament]);

  // Parse URL params for defaults
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("scoreType");
    const tournament = params.get("tournament");
    const tab = params.get("tab");
    
    if (type === "gross") setScoreType("gross");
    if (tournament) setSelectedTournament(parseInt(tournament));
    if (tab === "monthly") setActiveTab("monthly");
  }, []);

  // Fetch monthly standings with handicap data
  useEffect(() => {
    if (!activeTour || activeTab !== "monthly") return;
    
    async function fetchMonthlyStandings() {
      setMonthlyLoading(true);
      const now = new Date();
      const monthStr = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      
      const { data, error } = await supabase
        .from("sgt_monthly_standings")
        .select("*")
        .eq("tour_id", activeTour.tour_id)
        .eq("month", monthStr)
        .order(scoreType === "net" ? "net_position" : "gross_position", { ascending: true });
      
      if (!error && data) {
        // Fetch handicaps from tour members
        const { data: members } = await supabase
          .from("sgt_tour_members")
          .select("user_id, hcp_index, custom_hcp")
          .eq("tour_id", activeTour.tour_id);
        
        const hcpMap = new Map<number, number | null>();
        if (members) {
          for (const m of members) {
            hcpMap.set(m.user_id, m.custom_hcp ?? m.hcp_index);
          }
        }
        
        setMonthlyStandings(data.map(s => ({ ...s, hcp: hcpMap.get(s.player_id) ?? null })));
      }
      setMonthlyLoading(false);
    }
    
    fetchMonthlyStandings();
  }, [activeTour, activeTab, scoreType]);

  const { 
    standings: tournamentStandings, 
    isLoading: tournamentLoading,
    lastUpdated 
  } = useSGTTournamentStandings({
    id: selectedTournament,
    scoreType,
    enabled: !!selectedTournament && activeTab === "weekly",
    refreshInterval: 30000,
  });

  const isLoading = dataLoading || (activeTab === "weekly" ? tournamentLoading : monthlyLoading);

  // Filter tournaments for the active tour
  const filteredTournaments = activeTour 
    ? tournaments.filter(t => t.tour_id === activeTour.tour_id)
    : tournaments;

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
    if (score === "E") return "bg-green-100 text-green-700";
    if (score.startsWith("-")) return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  return (
    <div className="min-h-screen bg-[hsl(40,29%,94%)] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src={venueMark} alt={tenant.venue_name} className="h-10" />
          <div>
            <h1 className="font-bold text-xl text-[hsl(218,13%,13%)]">LEADERBOARD</h1>
            <p className="text-sm text-[hsl(128,20%,40%)]">{activeTour?.name || `${tenant.venue_name} Tour`}</p>
          </div>
        </div>
        {lastUpdated && activeTab === "weekly" && (
          <p className="text-xs text-[hsl(128,20%,40%)]">
            Updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "monthly" | "weekly")} className="mb-4">
        <TabsList className="grid w-full max-w-sm grid-cols-2 bg-[hsl(37,40%,90%)]">
          <TabsTrigger 
            value="monthly" 
            className="data-[state=active]:bg-[hsl(218,13%,13%)] data-[state=active]:text-white"
          >
            Monthly Winner
          </TabsTrigger>
          <TabsTrigger 
            value="weekly"
            className="data-[state=active]:bg-[hsl(218,13%,13%)] data-[state=active]:text-white"
          >
            Weekly Results
          </TabsTrigger>
        </TabsList>

        {/* Monthly Winner Tab */}
        <TabsContent value="monthly" className="mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[hsl(128,20%,85%)] rounded-lg">
              <Calendar className="h-4 w-4 text-[hsl(128,20%,40%)]" />
              <span className="text-[hsl(218,13%,13%)]">{currentMonth}</span>
            </div>

            <div className="flex-1 flex justify-center sm:justify-end">
              <div className="flex rounded-full bg-[hsl(37,40%,90%)] overflow-hidden">
                <button
                  onClick={() => setScoreType("gross")}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors rounded-full",
                    scoreType === "gross"
                      ? "bg-[hsl(218,13%,13%)] text-white"
                      : "text-[hsl(128,20%,40%)] hover:text-[hsl(218,13%,13%)]"
                  )}
                >
                  Gross
                </button>
                <button
                  onClick={() => setScoreType("net")}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors rounded-full",
                    scoreType === "net"
                      ? "bg-[hsl(218,13%,13%)] text-white"
                      : "text-[hsl(128,20%,40%)] hover:text-[hsl(218,13%,13%)]"
                  )}
                >
                  Net
                </button>
              </div>
            </div>
          </div>

          {/* Monthly Content */}
          {monthlyLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-[hsl(93,15%,38%)] animate-spin" />
            </div>
          ) : monthlyStandings.length === 0 ? (
            <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] p-12 text-center">
              <h3 className="font-bold text-lg text-[hsl(218,13%,13%)] mb-2">NO RESULTS YET</h3>
              <p className="text-[hsl(128,20%,40%)]">Monthly standings will appear once tournaments are completed</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] overflow-hidden shadow-sm">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-[hsl(218,13%,13%)] text-sm font-medium text-white">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-center">HCP</div>
                <div className="col-span-2 text-center">Played</div>
                <div className="col-span-3 text-center">Points</div>
              </div>

              <div className="divide-y divide-[hsl(128,20%,85%)]">
                {monthlyStandings.map((standing, index) => {
                  const position = scoreType === "net" ? standing.net_position : standing.gross_position;
                  const points = scoreType === "net" ? (standing.monthly_net_points ?? standing.total_net_score) : (standing.monthly_gross_points ?? standing.total_gross_score);

                  return (
                    <div
                      key={standing.id}
                      className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[hsl(40,29%,97%)] transition-colors"
                    >
                      <div className="col-span-1 flex items-center justify-center gap-1">
                        {getPositionIcon(position || index + 1)}
                        <span className={cn(
                          "font-bold",
                          (position || 0) <= 3 ? "text-[hsl(218,13%,13%)]" : "text-[hsl(128,20%,40%)]"
                        )}>
                          {position || index + 1}
                        </span>
                      </div>

                      <div className="col-span-4">
                        <p className="font-semibold text-[hsl(218,13%,13%)] truncate">
                          {nick(standing.player_name)}
                        </p>
                      </div>

                      <div className="col-span-2 text-center text-[hsl(128,20%,40%)]">
                        {standing.hcp != null ? Math.round(standing.hcp) : "-"}
                      </div>

                      <div className="col-span-2 text-center text-[hsl(128,20%,40%)]">
                        {standing.tournaments_played}
                      </div>

                      <div className="col-span-3 text-center font-bold text-[hsl(93,15%,38%)]">
                        {points ?? "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Weekly Results Tab */}
        <TabsContent value="weekly" className="mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {filteredTournaments.length > 0 && (
              <Select
                value={selectedTournament?.toString() || ""}
                onValueChange={(val) => setSelectedTournament(parseInt(val))}
              >
                <SelectTrigger className="w-full sm:w-[300px] bg-white border-[hsl(128,20%,85%)]">
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTournaments.map((tournament) => (
                    <SelectItem key={tournament.tournament_id} value={tournament.tournament_id.toString()}>
                      <div className="flex items-center gap-2">
                        <span>{tournament.name}</span>
                        {currentTournament && tournament.tournament_id === currentTournament.tournament_id && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[hsl(93,15%,38%)] text-white rounded">
                            CURRENT
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex-1 flex justify-center sm:justify-end">
              <div className="flex rounded-full bg-[hsl(37,40%,90%)] overflow-hidden">
                <button
                  onClick={() => setScoreType("gross")}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors rounded-full",
                    scoreType === "gross"
                      ? "bg-[hsl(218,13%,13%)] text-white"
                      : "text-[hsl(128,20%,40%)] hover:text-[hsl(218,13%,13%)]"
                  )}
                >
                  Gross
                </button>
                <button
                  onClick={() => setScoreType("net")}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors rounded-full",
                    scoreType === "net"
                      ? "bg-[hsl(218,13%,13%)] text-white"
                      : "text-[hsl(128,20%,40%)] hover:text-[hsl(218,13%,13%)]"
                  )}
                >
                  Net
                </button>
              </div>
            </div>
          </div>

          {/* Weekly Content */}
          {tournamentLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-[hsl(93,15%,38%)] animate-spin" />
            </div>
          ) : tournamentStandings.length === 0 ? (
            <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] p-12 text-center">
              <h3 className="font-bold text-lg text-[hsl(218,13%,13%)] mb-2">NO RESULTS YET</h3>
              <p className="text-[hsl(128,20%,40%)]">No results available for this tournament</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] overflow-hidden shadow-sm">
              {/* Table Header */}
              <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 bg-[hsl(218,13%,13%)] text-sm font-medium text-white">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-3">Player</div>
                <div className="col-span-1 text-center">HCP</div>
                <div className="col-span-2 text-center">Rd 1</div>
                <div className="col-span-2 text-center">Rd 2</div>
                <div className="col-span-1 text-center">Total</div>
                <div className="col-span-2 text-center">To Par</div>
              </div>

              {/* Mobile Header */}
              <div className="grid sm:hidden grid-cols-12 gap-1 px-3 py-2 bg-[hsl(218,13%,13%)] text-xs font-medium text-white">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-3">Player</div>
                <div className="col-span-2 text-center">Rd1</div>
                <div className="col-span-2 text-center">Rd2</div>
                <div className="col-span-2 text-center">Tot</div>
                <div className="col-span-2 text-center">+/-</div>
              </div>

              <div className="divide-y divide-[hsl(128,20%,85%)]">
                {tournamentStandings.map((result) => (
                  <div
                    key={result.playerName}
                    className="grid grid-cols-12 gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-3 items-center hover:bg-[hsl(40,29%,97%)] transition-colors"
                  >
                    <div className="col-span-1 flex items-center justify-center gap-0.5 sm:gap-1">
                      <span className="hidden sm:inline">{getPositionIcon(result.position)}</span>
                      <span className={cn(
                        "font-bold text-xs sm:text-base",
                        result.position <= 3 ? "text-[hsl(218,13%,13%)]" : "text-[hsl(128,20%,40%)]"
                      )}>
                        {result.position}
                      </span>
                    </div>

                    <div className="col-span-3">
                      <p className="font-semibold text-[hsl(218,13%,13%)] text-xs sm:text-base truncate">
                        {nick(result.playerName)}
                      </p>
                      <p className="hidden sm:block text-xs text-[hsl(128,20%,40%)]">
                        HCP: {result.hcp ?? "-"}
                      </p>
                    </div>

                    <div className="hidden sm:block col-span-1 text-center text-[hsl(128,20%,40%)]">
                      {result.hcp ?? "-"}
                    </div>

                    <div className="col-span-2 text-center text-xs sm:text-sm text-[hsl(128,20%,40%)]">
                      {result.r1}
                      {result.r1Thru && (
                        <span className="text-[10px] ml-0.5">
                          {result.r1Thru === "F" ? "F" : `(${result.r1Thru})`}
                        </span>
                      )}
                    </div>

                    <div className="col-span-2 text-center text-xs sm:text-sm text-[hsl(128,20%,40%)]">
                      {result.r2}
                      {result.r2Thru && (
                        <span className="text-[10px] ml-0.5">
                          {result.r2Thru === "F" ? "F" : `(${result.r2Thru})`}
                        </span>
                      )}
                    </div>

                    <div className="col-span-2 sm:col-span-1 text-center font-bold text-xs sm:text-base text-[hsl(218,13%,13%)]">
                      {result.total}
                    </div>

                    <div className="col-span-2 text-center">
                      <span className={cn(
                        "px-1 sm:px-2 py-0.5 sm:py-1 rounded font-bold text-xs sm:text-sm",
                        getScoreColor(result.toPar)
                      )}>
                        {result.toPar}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-[hsl(128,20%,40%)]">
        Powered by {tenant.venue_name} League Hub • Live updates every 30 seconds
      </div>
    </div>
  );
}
