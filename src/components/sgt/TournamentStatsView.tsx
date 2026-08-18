import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSgtNicknames } from "@/hooks/useSgtNicknames";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, Target, Flag, Crosshair, TrendingUp } from "lucide-react";

type PlayerRow = Record<string, unknown> & { user_name?: string; numrounds?: number };

interface CtpEntry {
  user_name: string;
  distanceToPin: number;
}
interface CtpHole {
  GIRCount?: number;
  averageDistance?: number;
  ctps?: CtpEntry[];
}

export interface StatsResponse {
  scoringAverage?: PlayerRow[];
  drivingDistance?: PlayerRow[];
  drivingAccuracy?: PlayerRow[];
  greenAccuracy?: PlayerRow[];
  girProx?: PlayerRow[];
  sandSave?: PlayerRow[];
  scrambling?: PlayerRow[];
  puttsPerRound?: PlayerRow[];
  puttsPerGIR?: PlayerRow[];
  feetPuttsMade?: PlayerRow[];
  puttMakePct1?: PlayerRow[];
  puttMakePct2?: PlayerRow[];
  puttMakePct3?: PlayerRow[];
  puttMakePct4?: PlayerRow[];
  puttMakePct5?: PlayerRow[];
  prox10to30?: PlayerRow[];
  prox30to50?: PlayerRow[];
  prox50to100?: PlayerRow[];
  prox100to125?: PlayerRow[];
  prox125to150?: PlayerRow[];
  prox150to175?: PlayerRow[];
  prox175to200?: PlayerRow[];
  prox200to225?: PlayerRow[];
  sgTee?: PlayerRow[];
  sgApproach?: PlayerRow[];
  sgATG?: PlayerRow[];
  sgGreen?: PlayerRow[];
  sgTeeToGreen?: PlayerRow[];
  sgTotal?: PlayerRow[];
  closestToPin?: Record<string, Record<string, CtpHole>>;
}

const fmt = (v: unknown, digits = 2): string =>
  typeof v === "number" ? v.toFixed(digits) : v == null ? "-" : String(v);

function AwardCard({
  icon: Icon,
  label,
  winner,
  value,
  subtitle,
}: {
  icon: typeof Trophy;
  label: string;
  winner?: unknown;
  value?: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className="text-base font-bold truncate">
          {winner ? String(winner) : "—"}
        </p>
        <p className="text-sm text-muted-foreground">
          {value || (subtitle ?? "—")}
        </p>
      </CardContent>
    </Card>
  );
}

function StatTable({
  rows,
  valueKey,
  valueLabel,
  digits = 2,
  suffix = "",
  limit = 15,
}: {
  rows?: PlayerRow[];
  valueKey: string;
  valueLabel: string;
  digits?: number;
  suffix?: string;
  limit?: number;
}) {
  const { nick } = useSgtNicknames();
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No data yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Rds</TableHead>
          <TableHead className="text-right">{valueLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, limit).map((r, i) => (
          <TableRow key={`${r.user_name}-${i}`}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">{nick(r.user_name)}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {r.numrounds ?? "-"}
            </TableCell>
            <TableCell className="text-right font-mono">
              {fmt(r[valueKey], digits)}
              {suffix}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface Props {
  tournamentId: number | null;
  isCompleted?: boolean;
  enabled?: boolean;
}

export function TournamentStatsView({ tournamentId, isCompleted, enabled = true }: Props) {
  const { nick } = useSgtNicknames();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sgt-tournament-stats", tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sgt-api", {
        body: {
          action: "tournament-stats",
          params: { tournamentId: tournamentId! },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as StatsResponse;
    },
    enabled: enabled && !!tournamentId,
    staleTime: 60_000,
  });

  const first = (rows?: PlayerRow[], key?: string, digits = 2, suffix = "") => {
    if (!rows || rows.length === 0 || !key) return { winner: undefined, value: undefined };
    const r = rows[0];
    return { winner: r.user_name, value: `${fmt(r[key], digits)}${suffix}` };
  };

  const scoreW = first(data?.scoringAverage, "scoring_avg", 2);
  const distW = first(data?.drivingDistance, "longest_drive", 1, " yd");
  const firW = first(data?.drivingAccuracy, "fir_percent", 1, "%");
  const girW = first(data?.greenAccuracy, "gir_percent", 1, "%");
  const puttW = first(data?.puttsPerRound, "putts_per_round", 2);
  const sgW = first(data?.sgTotal, "sg_total", 2);

  const overallCtp = (() => {
    if (!data?.closestToPin) return null;
    let best: { user_name: string; distance: number; round: string; hole: string } | null =
      null;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-8">
        Failed to load stats: {(error as Error).message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Weekly Awards */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Weekly Awards
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AwardCard icon={Trophy} label="Low Scoring Avg" winner={scoreW.winner} value={scoreW.value} />
          <AwardCard icon={Flag} label="Greens in Reg %" winner={girW.winner} value={girW.value} />
          <AwardCard icon={Target} label="Fairways in Reg %" winner={firW.winner} value={firW.value} />
          <AwardCard
            icon={TrendingUp}
            label="Avg Driving Distance"
            winner={distW.winner}
            value={distW.value}
            subtitle="on fairway hits"
          />
          <AwardCard icon={Trophy} label="Fewest Putts / Round" winner={puttW.winner} value={puttW.value} />
          <AwardCard
            icon={Trophy}
            label="Strokes Gained: Total"
            winner={sgW.winner}
            value={isCompleted ? sgW.value : undefined}
            subtitle={isCompleted ? undefined : "pending close"}
          />
        </div>
      </section>

      {/* Closest to Pin */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <Crosshair className="h-4 w-4" />
          Nearest to Pin (Par 3s)
        </h3>
        {overallCtp && (
          <Card className="mb-3 border-primary/40">
            <CardContent className="pt-4">
              <p className="text-xs uppercase text-muted-foreground">Tournament NTP Winner</p>
              <p className="text-lg font-bold">{nick(overallCtp.user_name)}</p>
              <p className="text-sm text-muted-foreground">
                {overallCtp.distance.toFixed(2)} ft · Round {overallCtp.round}, Hole {overallCtp.hole}
              </p>
            </CardContent>
          </Card>
        )}
        {data?.closestToPin && Object.keys(data.closestToPin).length > 0 ? (
          <Accordion type="multiple" className="w-full">
            {Object.entries(data.closestToPin).map(([round, holes]) => (
              <AccordionItem key={round} value={`r${round}`}>
                <AccordionTrigger className="text-sm">Round {round}</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    {Object.entries(holes).map(([hole, info]) => {
                      const winner = info.ctps?.[0];
                      return (
                        <div key={hole} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold">Hole {hole}</span>
                            <span className="text-xs text-muted-foreground">
                              Avg {info.averageDistance?.toFixed(1)} ft · {info.GIRCount} shots
                            </span>
                          </div>
                          {winner && (
                            <p className="text-sm mb-2">
                              🏆 <span className="font-medium">{nick(winner.user_name)}</span> ·{" "}
                              {winner.distanceToPin.toFixed(2)} ft
                            </p>
                          )}
                          <div className="space-y-1">
                            {(info.ctps || []).slice(1, 5).map((c, i) => (
                              <div key={i} className="flex justify-between text-xs text-muted-foreground">
                                <span>
                                  {i + 2}. {nick(c.user_name)}
                                </span>
                                <span className="font-mono">{c.distanceToPin.toFixed(2)} ft</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">No par-3 approach data recorded yet.</p>
        )}
      </section>

      {/* Full leaderboards */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Full Stat Leaderboards
        </h3>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="scoring">
            <AccordionTrigger>Scoring & Accuracy</AccordionTrigger>
            <AccordionContent className="space-y-6">
              <div>
                <p className="font-medium mb-2">Scoring Average</p>
                <StatTable rows={data?.scoringAverage} valueKey="scoring_avg" valueLabel="Avg" />
              </div>
              <div>
                <p className="font-medium mb-2">GIR %</p>
                <StatTable rows={data?.greenAccuracy} valueKey="gir_percent" valueLabel="GIR" digits={1} suffix="%" />
              </div>
              <div>
                <p className="font-medium mb-2">FIR %</p>
                <StatTable rows={data?.drivingAccuracy} valueKey="fir_percent" valueLabel="FIR" digits={1} suffix="%" />
              </div>
              <div>
                <p className="font-medium mb-2">Avg Driving Distance</p>
                <StatTable rows={data?.drivingDistance} valueKey="longest_drive" valueLabel="Yards" digits={1} suffix=" yd" />
              </div>
              <div>
                <p className="font-medium mb-2">GIR Proximity (ft)</p>
                <StatTable rows={data?.girProx} valueKey="gir_prox" valueLabel="Ft" digits={1} suffix=" ft" />
              </div>
              <div>
                <p className="font-medium mb-2">Sand Saves</p>
                <StatTable rows={data?.sandSave} valueKey="sand_save_percent" valueLabel="%" digits={1} suffix="%" />
              </div>
              <div>
                <p className="font-medium mb-2">Scrambling</p>
                <StatTable rows={data?.scrambling} valueKey="scrambling_percent" valueLabel="%" digits={1} suffix="%" />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="putting">
            <AccordionTrigger>Putting</AccordionTrigger>
            <AccordionContent className="space-y-6">
              <div>
                <p className="font-medium mb-2">Putts per Round</p>
                <StatTable rows={data?.puttsPerRound} valueKey="putts_per_round" valueLabel="Putts" />
              </div>
              <div>
                <p className="font-medium mb-2">Putts per GIR</p>
                <StatTable rows={data?.puttsPerGIR} valueKey="putts_per_gir" valueLabel="Putts" />
              </div>
              <div>
                <p className="font-medium mb-2">Feet of Putts Made</p>
                <StatTable rows={data?.feetPuttsMade} valueKey="feet_putts_made" valueLabel="Ft" digits={1} suffix=" ft" />
              </div>
              {[
                { key: "puttMakePct1", label: "Make % 5-10 ft" },
                { key: "puttMakePct2", label: "Make % 10-15 ft" },
                { key: "puttMakePct3", label: "Make % 15-20 ft" },
                { key: "puttMakePct4", label: "Make % 20-25 ft" },
                { key: "puttMakePct5", label: "Make % 25-30 ft" },
              ].map((b) => (
                <div key={b.key}>
                  <p className="font-medium mb-2">{b.label}</p>
                  <StatTable
                    rows={data?.[b.key as keyof StatsResponse] as PlayerRow[]}
                    valueKey="putt_make_pct"
                    valueLabel="%"
                    digits={1}
                    suffix="%"
                  />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="approach">
            <AccordionTrigger>Approach Proximity</AccordionTrigger>
            <AccordionContent className="space-y-6">
              {[
                { key: "prox10to30", label: "10-30 yd" },
                { key: "prox30to50", label: "30-50 yd" },
                { key: "prox50to100", label: "50-100 yd" },
                { key: "prox100to125", label: "100-125 yd" },
                { key: "prox125to150", label: "125-150 yd" },
                { key: "prox150to175", label: "150-175 yd" },
                { key: "prox175to200", label: "175-200 yd" },
                { key: "prox200to225", label: "200-225 yd" },
              ].map((b) => (
                <div key={b.key}>
                  <p className="font-medium mb-2">Proximity {b.label} (ft)</p>
                  <StatTable
                    rows={data?.[b.key as keyof StatsResponse] as PlayerRow[]}
                    valueKey="proximity"
                    valueLabel="Ft"
                    digits={1}
                    suffix=" ft"
                  />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sg">
            <AccordionTrigger>Strokes Gained {!isCompleted && "(after close)"}</AccordionTrigger>
            <AccordionContent className="space-y-6">
              {!isCompleted ? (
                <p className="text-sm text-muted-foreground">
                  Strokes Gained data only populates once the tournament status is Completed.
                </p>
              ) : (
                <>
                  {([
                    { key: "sgTotal", label: "SG: Total", valKey: "sg_total" },
                    { key: "sgTee", label: "SG: Tee", valKey: "sg_tee" },
                    { key: "sgApproach", label: "SG: Approach", valKey: "sg_approach" },
                    { key: "sgATG", label: "SG: Around the Green", valKey: "sg_atg" },
                    { key: "sgGreen", label: "SG: Putting", valKey: "sg_green" },
                    { key: "sgTeeToGreen", label: "SG: Tee to Green", valKey: "sg_tee_to_green" },
                  ] as const).map((b) => (
                    <div key={b.key}>
                      <p className="font-medium mb-2">{b.label}</p>
                      <StatTable
                        rows={data?.[b.key] as PlayerRow[] | undefined}
                        valueKey={b.valKey}
                        valueLabel="Strokes"
                        digits={2}
                      />
                    </div>
                  ))}
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </div>
  );
}
