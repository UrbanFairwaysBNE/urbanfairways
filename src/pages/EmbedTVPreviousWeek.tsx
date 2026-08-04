import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSGTTournamentStandings } from "@/hooks/useSGTEmbedData";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import venueLogo from "@/assets/venue-logo-mark.png";
import { useTenant } from "@/config/tenant";

export default function EmbedTVLastWeek() {
  const { tenant } = useTenant();
  const { previousTournament, isLoading: tourLoading } = useActiveTourData();

  const { standings, isLoading: standingsLoading, lastUpdated } = useSGTTournamentStandings({
    id: previousTournament?.tournament_id ?? null,
    scoreType: "net",
    enabled: !!previousTournament,
    refreshInterval: 30000,
  });

  const isLoading = tourLoading || standingsLoading;

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-8 w-8 text-yellow-500" />;
      case 2: return <Medal className="h-8 w-8 text-gray-400" />;
      case 3: return <Award className="h-8 w-8 text-amber-600" />;
      default: return null;
    }
  };

  const getScoreColor = (toPar: string) => {
    if (toPar === "-" || toPar === "") return "";
    if (toPar === "E") return "bg-green-100 text-green-700";
    if (toPar.startsWith("-")) return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
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
              {previousTournament?.name || "Previous Week"}
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              {previousTournament?.course_name || `${tenant.venue_name} Tour`} • NET Scores
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="px-6 py-3 bg-[hsl(18,84%,55%)] text-white rounded-lg text-xl font-bold">
            PREVIOUS WEEK
          </div>
          {lastUpdated && (
            <p className="text-sm text-[hsl(128,20%,40%)] mt-2">
              Updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="flex-1 bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] overflow-hidden shadow-lg">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-[hsl(128,42%,21%)] text-xl font-bold text-white">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-1 text-center">HCP</div>
          <div className="col-span-2 text-center">Rd 1</div>
          <div className="col-span-2 text-center">Rd 2</div>
          <div className="col-span-2 text-center">Total</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-[hsl(128,20%,85%)]">
          {standings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-2xl text-[hsl(128,20%,40%)]">
                No results available yet
              </p>
              <p className="text-lg text-[hsl(128,20%,60%)] mt-2">
                Play a round to appear on the leaderboard!
              </p>
            </div>
          ) : (
            standings.slice(0, 12).map((result) => (
              <div
                key={result.playerName}
                className={cn(
                  "grid grid-cols-12 gap-4 px-6 py-4 items-center",
                  result.position <= 3 && "bg-[hsl(37,100%,97%)]"
                )}
              >
                <div className="col-span-1 flex items-center justify-center gap-2">
                  {getPositionIcon(result.position)}
                  <span className={cn(
                    "font-bold text-2xl",
                    result.position <= 3 ? "text-[hsl(128,42%,21%)]" : "text-[hsl(128,20%,40%)]"
                  )}>
                    {result.position}
                  </span>
                </div>

                <div className="col-span-4">
                  <p className="font-bold text-2xl text-[hsl(128,42%,21%)]">{result.playerName}</p>
                </div>

                <div className="col-span-1 text-center text-xl text-[hsl(128,20%,40%)]">
                  {result.hcp ?? "-"}
                </div>

                <div className="col-span-2 text-center">
                  <span className="text-xl text-[hsl(128,20%,40%)]">{result.r1}</span>
                  {result.r1Thru && (
                    <span className="text-sm text-[hsl(128,20%,40%)] ml-1">
                      {result.r1Thru === "F" ? "F" : `(${result.r1Thru})`}
                    </span>
                  )}
                </div>

                <div className="col-span-2 text-center">
                  <span className="text-xl text-[hsl(128,20%,40%)]">{result.r2}</span>
                  {result.r2Thru && (
                    <span className="text-sm text-[hsl(128,20%,40%)] ml-1">
                      {result.r2Thru === "F" ? "F" : `(${result.r2Thru})`}
                    </span>
                  )}
                </div>

                <div className="col-span-2 text-center">
                  <span className={cn(
                    "px-4 py-2 rounded-lg font-bold text-2xl",
                    getScoreColor(result.toPar)
                  )}>
                    {result.toPar}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-lg text-[hsl(128,20%,40%)]">
        Live Results • Updates every 30 seconds • Powered by {tenant.venue_name} League Hub
      </div>
    </div>
  );
}
