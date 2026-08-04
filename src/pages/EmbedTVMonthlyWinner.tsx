import { useEffect, useState } from "react";
import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import venueLogo from "@/assets/venue-logo-mark.png";
import { getCurrentBlockLabel } from "@/lib/league-block";
import { useTenant } from "@/config/tenant";

interface MonthlyStanding {
  player_id: number;
  player_name: string;
  tournaments_played: number;
  total_net_score: number | null;
  total_gross_score: number | null;
  best_net: number | null;
  best_gross: number | null;
  net_position: number | null;
  gross_position: number | null;
}

export default function EmbedTVStandings() {
  const { tenant } = useTenant();
  const [standings, setStandings] = useState<MonthlyStanding[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string>("");
  const [tourName, setTourName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = async () => {
    try {
      // Use the current 4-week block label (e.g. "May 2026").
      const monthStr = getCurrentBlockLabel();
      setCurrentMonth(monthStr);

      // Get active tour
      const { data: activeTour } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("active", 1)
        .maybeSingle();

      if (activeTour) {
        setTourName(activeTour.name);

        // Get monthly standings for current month
        const { data: monthlyStandings } = await supabase
          .from("sgt_monthly_standings")
          .select("*")
          .eq("tour_id", activeTour.tour_id)
          .eq("month", monthStr)
          .order("net_position", { ascending: true });

        if (monthlyStandings && monthlyStandings.length > 0) {
          setStandings(monthlyStandings);
        } else {
          setStandings([]);
        }
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load monthly standings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 60 seconds
    const interval = setInterval(loadData, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-8 w-8 text-yellow-500" />;
      case 2: return <Medal className="h-8 w-8 text-gray-400" />;
      case 3: return <Award className="h-8 w-8 text-amber-600" />;
      default: return null;
    }
  };

  const formatPoints = (points: number | null) => {
    if (points === null || points === undefined) return "-";
    return `${points} pts`;
  };

  const formatScore = (score: number | null) => {
    if (score === null || score === undefined) return "-";
    if (score === 0) return "E";
    if (score > 0) return `+${score}`;
    return score.toString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(37,100%,95%)] flex items-center justify-center">
        <Loader2 className="h-16 w-16 text-[hsl(18,84%,55%)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(37,100%,95%)] p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <img src={venueLogo} alt={tenant.venue_name} className="h-16" />
          <div>
            <h1 className="font-bold text-4xl text-[hsl(128,42%,21%)] tracking-tight">
              MONTHLY WINNER
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              {currentMonth} • {tourName || `${tenant.venue_name} Tour`} • NET Scores
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="px-6 py-3 bg-[hsl(18,84%,55%)] text-white rounded-lg text-xl font-bold">
            {currentMonth.toUpperCase().split(" ")[0]}
          </div>
          <p className="text-sm text-[hsl(128,20%,40%)] mt-2">
            Updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Standings Table */}
      <div className="flex-1 bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] overflow-hidden shadow-lg">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-[hsl(128,42%,21%)] text-xl font-bold text-white">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-5">Player</div>
          <div className="col-span-2 text-center">Rounds</div>
          <div className="col-span-2 text-center">Best</div>
          <div className="col-span-2 text-center">Points</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-[hsl(128,20%,85%)]">
          {standings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-2xl text-[hsl(128,20%,40%)]">
                No standings yet for {currentMonth}
              </p>
              <p className="text-lg text-[hsl(128,20%,60%)] mt-2">
                Play a round to appear on the leaderboard!
              </p>
            </div>
          ) : (
            standings.slice(0, 12).map((standing) => {
              const position = standing.net_position ?? 0;
              return (
                <div
                  key={standing.player_id}
                  className={cn(
                    "grid grid-cols-12 gap-4 px-6 py-4 items-center",
                    position <= 3 && "bg-[hsl(37,100%,97%)]"
                  )}
                >
                  <div className="col-span-1 flex items-center justify-center gap-2">
                    {getPositionIcon(position)}
                    <span className={cn(
                      "font-bold text-2xl",
                      position <= 3 ? "text-[hsl(128,42%,21%)]" : "text-[hsl(128,20%,40%)]"
                    )}>
                      {position}
                    </span>
                  </div>

                  <div className="col-span-5">
                    <p className="font-bold text-2xl text-[hsl(128,42%,21%)]">
                      {standing.player_name}
                    </p>
                  </div>

                  <div className="col-span-2 text-center text-xl text-[hsl(128,20%,40%)]">
                    {standing.tournaments_played}
                  </div>

                  <div className="col-span-2 text-center">
                    <span className={cn(
                      "px-3 py-1 rounded-lg font-bold text-xl",
                      standing.best_net !== null && standing.best_net < 0 && "bg-red-100 text-red-700",
                      standing.best_net === 0 && "bg-green-100 text-green-700",
                      standing.best_net !== null && standing.best_net > 0 && "bg-blue-100 text-blue-700",
                    )}>
                      {formatScore(standing.best_net)}
                    </span>
                  </div>

                  <div className="col-span-2 text-center">
                    <span className={cn(
                      "px-4 py-2 rounded-lg font-bold text-2xl",
                      "bg-[hsl(18,84%,55%)]/10 text-[hsl(18,84%,55%)]",
                    )}>
                      {formatPoints(standing.total_net_score)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-lg text-[hsl(128,20%,40%)]">
        Monthly Winner rankings • Updates every 60 seconds • Powered by {tenant.venue_name} League Hub
      </div>
    </div>
  );
}
