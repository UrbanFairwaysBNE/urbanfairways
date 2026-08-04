import { Loader2, Trophy, Target, Flag, TrendingUp, Crosshair, Ruler } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import type { StatsResponse } from "@/components/sgt/TournamentStatsView";
import venueLogo from "@/assets/venue-logo-mark.png";
import { useTenant } from "@/config/tenant";

type PlayerRow = Record<string, unknown> & { user_name?: string; numrounds?: number };

const YARDS_TO_M = 0.9144;
const FEET_TO_M = 0.3048;

const fmt = (v: unknown, digits = 2): string =>
  typeof v === "number" ? v.toFixed(digits) : v == null ? "-" : String(v);

interface AwardProps {
  icon: typeof Trophy;
  label: string;
  rows?: PlayerRow[];
  valueKey: string;
  digits?: number;
  suffix?: string;
  transform?: (n: number) => number;
}

function AwardBig({ icon: Icon, label, rows, valueKey, digits = 2, suffix = "", transform }: AwardProps) {
  const winner = rows?.[0];
  const rawUnknown = winner?.[valueKey];
  const rawNum =
    typeof rawUnknown === "number"
      ? rawUnknown
      : typeof rawUnknown === "string" && rawUnknown.trim() !== "" && !isNaN(Number(rawUnknown))
        ? Number(rawUnknown)
        : null;
  const displayValue =
    rawNum !== null ? (transform ? transform(rawNum) : rawNum).toFixed(digits) : "—";
  return (
    <div className="bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 text-[hsl(128,20%,40%)] text-sm uppercase tracking-wide font-semibold mb-2">
        <Icon className="h-4 w-4 text-[hsl(32,62%,44%)]" />
        {label}
      </div>
      <p className="text-2xl font-bold text-[hsl(220,4%,20%)] truncate">
        {winner?.user_name ? String(winner.user_name) : "—"}
      </p>
      <p className="text-3xl font-black text-[hsl(32,62%,44%)] mt-1 font-mono">
        {winner ? `${displayValue}${suffix}` : "—"}
      </p>
    </div>
  );
}

function MiniTable({
  title,
  rows,
  valueKey,
  digits = 2,
  suffix = "",
  transform,
}: {
  title: string;
  rows?: PlayerRow[];
  valueKey: string;
  digits?: number;
  suffix?: string;
  transform?: (n: number) => number;
}) {
  const top = (rows ?? []).slice(0, 3);
  return (
    <div className="bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-2 bg-[hsl(220,4%,20%)] text-white font-bold text-base text-center">
        {title}
      </div>
      <div className="divide-y divide-[hsl(128,20%,90%)] flex-1">
        {top.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[hsl(128,20%,40%)]">No data yet</div>
        )}
        {top.map((r, i) => {
          const rawUnknown = r[valueKey];
          const rawNum =
            typeof rawUnknown === "number"
              ? rawUnknown
              : typeof rawUnknown === "string" && rawUnknown.trim() !== "" && !isNaN(Number(rawUnknown))
                ? Number(rawUnknown)
                : null;
          const val = rawNum !== null ? (transform ? transform(rawNum) : rawNum).toFixed(digits) : "—";
          return (
            <div
              key={`${r.user_name}-${i}`}
              className={i === 0 ? "grid grid-cols-12 gap-2 items-center px-4 py-2.5 bg-[hsl(37,100%,97%)]" : "grid grid-cols-12 gap-2 items-center px-4 py-2.5"}
            >
              <div className="col-span-1 text-center font-bold text-[hsl(128,20%,40%)]">{i + 1}</div>
              <div className="col-span-7 font-semibold text-[hsl(220,4%,20%)] truncate">
                {r.user_name}
              </div>
              <div className="col-span-4 text-right font-mono font-bold text-[hsl(220,4%,20%)]">
                {val}
                {suffix}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



export default function EmbedTVStats({ variant }: { variant: "current" | "previous" }) {
  const { tenant } = useTenant();
  const { currentTournament, previousTournament, isLoading: tourLoading } = useActiveTourData();
  const tournament = variant === "current" ? currentTournament : previousTournament;
  const tournamentId = tournament?.tournament_id ?? null;

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["sgt-tournament-stats", tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sgt-api", {
        body: { action: "tournament-stats", params: { tournamentId: tournamentId! } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as StatsResponse;
    },
    enabled: !!tournamentId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Overall NTP winner from closestToPin
  const overallCtp = (() => {
    if (!data?.closestToPin) return null;
    let best: { user_name: string; distance: number; round: string; hole: string } | null = null;
    for (const [round, holes] of Object.entries(data.closestToPin)) {
      for (const [hole, info] of Object.entries(holes)) {
        for (const c of info.ctps || []) {
          if (!best || c.distanceToPin < best.distance) {
            best = { user_name: c.user_name, distance: c.distanceToPin, round, hole };
          }
        }
      }
    }
    return best;
  })();

  const busy = tourLoading || (isLoading && !!tournamentId);
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const isCurrent = variant === "current";
  const badge = isCurrent ? "CURRENT WEEK STATS" : "PREVIOUS WEEK STATS";

  if (busy) {
    return (
      <div className="min-h-screen bg-[hsl(40,20%,95%)] flex items-center justify-center">
        <Loader2 className="h-16 w-16 text-[hsl(32,62%,44%)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(40,20%,95%)] p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <img src={venueLogo} alt={tenant.venue_name} className="h-16" />
          <div>
            <h1 className="font-bold text-4xl text-[hsl(220,4%,20%)] tracking-tight">
              {tournament?.name || (isCurrent ? "This Week" : "Previous Week")}
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              {tournament?.course_name || `${tenant.venue_name} Tour`} • Tournament Stats
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="px-6 py-3 bg-[hsl(32,62%,44%)] text-white rounded-lg text-xl font-bold">
            {badge}
          </div>
          {lastUpdated && (
            <p className="text-sm text-[hsl(128,20%,40%)] mt-2">
              Updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Weekly Award Winners */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <AwardBig
          icon={Trophy}
          label="Low Scoring Avg"
          rows={data?.scoringAverage}
          valueKey="scoring_avg"
          digits={2}
        />
        <AwardBig
          icon={Flag}
          label="Greens in Reg"
          rows={data?.greenAccuracy}
          valueKey="gir_percent"
          digits={1}
          suffix="%"
        />
        <AwardBig
          icon={Target}
          label="Fairways in Reg"
          rows={data?.drivingAccuracy}
          valueKey="fir_percent"
          digits={1}
          suffix="%"
        />
        <AwardBig
          icon={TrendingUp}
          label="Driving Distance"
          rows={data?.drivingDistance}
          valueKey="longest_drive"
          digits={1}
          suffix=" m"
          transform={(n) => n * YARDS_TO_M}
        />
        <AwardBig
          icon={Trophy}
          label="Fewest Putts / Rd"
          rows={data?.puttsPerRound}
          valueKey="putts_per_round"
          digits={2}
        />
        <div className="bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] shadow-sm p-5 flex flex-col">
          <div className="flex items-center gap-2 text-[hsl(128,20%,40%)] text-sm uppercase tracking-wide font-semibold mb-2">
            <Crosshair className="h-4 w-4 text-[hsl(32,62%,44%)]" />
            Nearest to Pin
          </div>
          <p className="text-2xl font-bold text-[hsl(220,4%,20%)] truncate">
            {overallCtp?.user_name || "—"}
          </p>
          <p className="text-3xl font-black text-[hsl(32,62%,44%)] mt-1 font-mono">
            {overallCtp ? `${(overallCtp.distance * FEET_TO_M).toFixed(2)} m` : "—"}
          </p>
          {overallCtp && (
            <p className="text-xs text-[hsl(128,20%,40%)] mt-1">
              R{overallCtp.round} · Hole {overallCtp.hole}
            </p>
          )}
        </div>
      </div>

      {/* All available top-3 stat tables */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {(
          [
            { title: "Scoring Average", key: "scoringAverage", valueKey: "scoring_avg", digits: 2 },
            { title: "Driving Distance", key: "drivingDistance", valueKey: "longest_drive", digits: 1, suffix: " m", transform: (n: number) => n * YARDS_TO_M },
            { title: "Fairways in Reg", key: "drivingAccuracy", valueKey: "fir_percent", digits: 1, suffix: "%" },
            { title: "Greens in Reg", key: "greenAccuracy", valueKey: "gir_percent", digits: 1, suffix: "%" },
            { title: "GIR Proximity", key: "girProx", valueKey: "gir_prox", digits: 2, suffix: " m", transform: (n: number) => n * FEET_TO_M },
            { title: "Scrambling", key: "scrambling", valueKey: "scrambling_percent", digits: 1, suffix: "%" },
            { title: "Sand Saves", key: "sandSave", valueKey: "sand_save_percent", digits: 1, suffix: "%" },
            { title: "Putts / Round", key: "puttsPerRound", valueKey: "putts_per_round", digits: 2 },
            { title: "Putts / GIR", key: "puttsPerGIR", valueKey: "putts_per_gir", digits: 2 },
            { title: "Feet Putts Made", key: "feetPuttsMade", valueKey: "feet_putts_made", digits: 2, suffix: " m", transform: (n: number) => n * FEET_TO_M },
            { title: "Make % 5-10 ft", key: "puttMakePct1", valueKey: "putt_make_pct", digits: 1, suffix: "%" },
            { title: "Make % 10-15 ft", key: "puttMakePct2", valueKey: "putt_make_pct", digits: 1, suffix: "%" },
            { title: "Make % 15-20 ft", key: "puttMakePct3", valueKey: "putt_make_pct", digits: 1, suffix: "%" },
            { title: "Prox 100-125 yd", key: "prox100to125", valueKey: "proximity", digits: 2, suffix: " m", transform: (n: number) => n * FEET_TO_M },
            { title: "Prox 125-150 yd", key: "prox125to150", valueKey: "proximity", digits: 2, suffix: " m", transform: (n: number) => n * FEET_TO_M },
            { title: "Prox 150-175 yd", key: "prox150to175", valueKey: "proximity", digits: 2, suffix: " m", transform: (n: number) => n * FEET_TO_M },
            { title: "SG: Total", key: "sgTotal", valueKey: "sg_total", digits: 2 },
            { title: "SG: Tee", key: "sgTee", valueKey: "sg_tee", digits: 2 },
            { title: "SG: Approach", key: "sgApproach", valueKey: "sg_approach", digits: 2 },
            { title: "SG: Around Green", key: "sgATG", valueKey: "sg_atg", digits: 2 },
            { title: "SG: Putting", key: "sgGreen", valueKey: "sg_green", digits: 2 },
            { title: "SG: Tee to Green", key: "sgTeeToGreen", valueKey: "sg_tee_to_green", digits: 2 },
          ] as const
        ).map((t) => (
          <MiniTable
            key={t.key}
            title={t.title}
            rows={data?.[t.key as keyof StatsResponse] as PlayerRow[] | undefined}
            valueKey={t.valueKey}
            digits={t.digits}
            suffix={"suffix" in t ? t.suffix : ""}
            transform={"transform" in t ? t.transform : undefined}
          />
        ))}
      </div>



      {/* Footer */}
      <div className="text-center text-lg text-[hsl(128,20%,40%)] flex items-center justify-center gap-2">
        <Ruler className="h-4 w-4" />
        Live updates every 30 seconds • Powered by {tenant.venue_name} League Hub
      </div>
    </div>
  );
}
