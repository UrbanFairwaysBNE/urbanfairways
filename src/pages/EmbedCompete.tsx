import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Award, Flame, Calendar, Target, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import { useSGTTournamentStandings } from "@/hooks/useSGTEmbedData";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import venueMark from "@/assets/venue-logo-mark.png";
import { useIframeAutoResize } from "@/hooks/useIframeAutoResize";
import { TournamentStatsView } from "@/components/sgt/TournamentStatsView";
import { useTenant, hubUrl } from "@/config/tenant";


// Brand tokens (locked to iframe so it renders consistently inside Shopify)
const GREEN = "hsl(128,42%,21%)";
const ORANGE = "hsl(18,84%,55%)";
const CREAM = "hsl(37,100%,95%)";
const CREAM_DEEP = "hsl(37,40%,90%)";
const MUTED = "hsl(128,20%,40%)";
const BORDER = "hsl(128,20%,85%)";

interface MonthlyStanding {
  id: string;
  player_name: string;
  player_id: number;
  net_position: number | null;
  gross_position: number | null;
  monthly_net_points: number | null;
  monthly_gross_points: number | null;
  tournaments_played: number;
}

const positionIcon = (pos: number) => {
  if (pos === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
  if (pos === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (pos === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return null;
};

const toParColor = (s: string) => {
  if (!s || s === "-" || s === "") return "";
  if (s === "E") return "bg-green-100 text-green-700";
  if (s.startsWith("-")) return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-700";
};

const getScoreTextColor = (s: string) => {
  if (!s || s === "-" || s === "") return "text-muted-foreground";
  if (s === "E") return "text-green-700";
  if (s.startsWith("-")) return "text-red-700";
  return "text-blue-700";
};

export default function EmbedCompete({ hideHero = false }: { hideHero?: boolean } = {}) {
  const { tenant } = useTenant();
  useIframeAutoResize();
  const { activeTour, currentTournament, previousTournament, isLoading: tourLoading } = useActiveTourData();
  const [scoreType, setScoreType] = useState<"gross" | "net">("net");
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyView, setWeeklyView] = useState<"scores" | "stats">("scores");
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [ambroseOpen, setAmbroseOpen] = useState(false);

  const weeklyTournamentId =
    currentTournament?.tournament_id ?? previousTournament?.tournament_id ?? null;
  const weeklyIsCompleted =
    (currentTournament ?? previousTournament)?.status === "Completed";


  // Weekly tournament standings
  const { standings: weeklyStandings, isLoading: weeklyLoading } = useSGTTournamentStandings({
    id: currentTournament?.tournament_id ?? previousTournament?.tournament_id ?? null,
    scoreType,
    enabled: !!(currentTournament?.tournament_id || previousTournament?.tournament_id),
    refreshInterval: 60000,
  });

  // Monthly standings
  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Australia/Brisbane" });
  const { data: monthlyStandings = [], isLoading: monthlyLoading } = useQuery<MonthlyStanding[]>({
    queryKey: ["compete-monthly", activeTour?.tour_id, currentMonth, scoreType],
    enabled: !!activeTour?.tour_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_monthly_standings")
        .select("*")
        .eq("tour_id", activeTour!.tour_id)
        .eq("month", currentMonth)
        .order(scoreType === "net" ? "net_position" : "gross_position", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data as MonthlyStanding[]) ?? [];
    },
    refetchInterval: 60000,
  });

  // Latest Ambrose competition with scores
  const { data: ambroseComp } = useQuery({
    queryKey: ["compete-ambrose-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .in("status", ["active", "completed"])
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // Next upcoming Ambrose
  const { data: nextAmbrose } = useQuery({
    queryKey: ["compete-ambrose-next"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .eq("status", "upcoming")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: ambroseTeams = [] } = useQuery({
    queryKey: ["compete-ambrose-teams", ambroseComp?.id],
    enabled: !!ambroseComp?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_teams")
        .select("*")
        .eq("competition_id", ambroseComp!.id);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const sortedAmbroseTeams = useMemo(() => {
    return [...ambroseTeams].sort((a: any, b: any) => {
      if (a.net_score === null && b.net_score === null) return 0;
      if (a.net_score === null) return 1;
      if (b.net_score === null) return -1;
      if (a.net_score === b.net_score) {
        const g = (a.gross_score || 999) - (b.gross_score || 999);
        if (g !== 0) return g;
        return (a.position || 999) - (b.position || 999);
      }
      return a.net_score - b.net_score;
    }).slice(0, 5);
  }, [ambroseTeams]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: CREAM, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* HERO */}
      {!hideHero && (
        <section className="relative overflow-hidden" style={{ backgroundColor: GREEN }}>
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)",
              backgroundSize: "48px 48px, 36px 36px",
            }}
          />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <div className="flex items-center gap-3 mb-4">
              <img src={venueMark} alt="" className="h-8 sm:h-10" />
              <span className="text-white/70 font-semibold tracking-[0.2em] text-xs sm:text-sm uppercase">
                {tenant.venue_name}
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl text-white leading-none mb-4">
              COMPETE.
            </h1>
            <p className="text-white/80 text-lg sm:text-xl max-w-2xl mb-8 leading-relaxed">
              Every week. Every Wednesday. Every month. Live leaderboards, real prizes,
              and a tour that runs all year long.
            </p>
          </div>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-8">
          <div className="text-[11px] uppercase tracking-widest font-bold" style={{ color: ORANGE }}>
            Three ways to play
          </div>
          <h3 className="font-black text-3xl sm:text-4xl" style={{ color: GREEN, fontFamily: "'Archivo', system-ui, sans-serif" }}>
            HOW TO COMPETE
          </h3>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <HowCard
            icon={<Calendar className="h-6 w-6" />}
            tag="Weekly · Members"
            title={`The ${tenant.venue_name} League`}
            desc="Play your two competition rounds anytime during the week. Live net + gross leaderboards."
            prize="$40 prize per week"
          />
          <HowCard
            icon={<Trophy className="h-6 w-6" />}
            tag="Monthly · Members"
            title="Monthly Winner"
            desc={`Earn points from every weekly ${tenant.venue_name} League tournament that follows the PGA tour. Top of the table at month's end takes the title.`}
            prize="Varied monthly prizes"
          />
          <HowCard
            icon={<Target className="h-6 w-6" />}
            tag="Wednesdays · Open"
            title="2-Man Ambrose"
            desc="Team comp every Wednesday night. Combined handicaps, alternating shots, weekly pot."
            prize="$100 Prize pot"
          />
        </div>
      </section>

      {/* SCORE TYPE TOGGLE */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
          <Flame className="h-4 w-4" style={{ color: ORANGE }} />
          <span>Live · refreshes every minute</span>
        </div>
        <div className="flex rounded-full overflow-hidden p-1" style={{ backgroundColor: CREAM_DEEP }}>
          {(["net", "gross"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setScoreType(t)}
              className="px-4 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-wider rounded-full transition-all"
              style={{
                backgroundColor: scoreType === t ? GREEN : "transparent",
                color: scoreType === t ? "white" : MUTED,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* WEEKLY */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: BORDER }}>
          <button
            onClick={() => setWeeklyOpen(!weeklyOpen)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[hsl(37,100%,97%)] transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: CREAM_DEEP, color: GREEN }}>
                <Trophy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded text-white mb-1" style={{ backgroundColor: ORANGE }}>
                  Weekly
                </span>
                <h3 className="font-black text-lg leading-tight" style={{ color: GREEN, fontFamily: "'Archivo', system-ui, sans-serif" }}>
                  {tenant.venue_name} League
                </h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
                  {currentTournament?.name ?? previousTournament?.name ?? `${tenant.venue_name} Tour`}
                </p>
              </div>
            </div>
            <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", weeklyOpen && "rotate-180")} style={{ color: MUTED }} />
          </button>
          {weeklyOpen && (
            <div className="border-t" style={{ borderColor: BORDER }}>
              <div className="px-5 pt-3 pb-1 flex justify-center">
                <div className="flex rounded-full overflow-hidden p-1" style={{ backgroundColor: CREAM_DEEP }}>
                  {(["scores", "stats"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setWeeklyView(v)}
                      className="px-5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all"
                      style={{
                        backgroundColor: weeklyView === v ? GREEN : "transparent",
                        color: weeklyView === v ? "white" : MUTED,
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {weeklyView === "stats" ? (
                <div className="px-5 py-4">
                  {weeklyTournamentId ? (
                    <TournamentStatsView
                      tournamentId={weeklyTournamentId}
                      isCompleted={weeklyIsCompleted}
                    />
                  ) : (
                    <EmptyState text="No tournament yet." />
                  )}
                </div>
              ) : (
              <div className="px-5 py-2">

                {tourLoading || weeklyLoading ? (
                  <LoadingRow />
                ) : weeklyStandings.length === 0 ? (
                  <EmptyState text="No scores yet this week, be the first on the board." />
                ) : (
                  <div>
                    <div className="grid grid-cols-12 gap-2 py-2 items-center text-[10px] font-bold uppercase tracking-wider border-b" style={{ color: MUTED, borderColor: BORDER }}>
                      <div className="col-span-1"></div>
                      <div className="col-span-5 sm:col-span-4">Player</div>
                      <div className="col-span-2 text-center">R1</div>
                      <div className="col-span-2 text-center">R2</div>
                      <div className="hidden sm:block sm:col-span-2 text-center">Total</div>
                      <div className="col-span-2 sm:col-span-1 text-center">+/-</div>
                    </div>
                    <div className="divide-y" style={{ borderColor: BORDER }}>
                      {weeklyStandings.slice(0, 8).map((r) => (
                        <div key={r.playerName} className="grid grid-cols-12 gap-2 py-3 items-center">
                          <div className="col-span-1 flex items-center gap-1">
                            {positionIcon(r.position) || (
                              <span className="font-bold text-sm" style={{ color: r.position <= 3 ? GREEN : MUTED }}>
                                {r.position}
                              </span>
                            )}
                          </div>
                          <div className="col-span-5 sm:col-span-4 min-w-0">
                            <p className="font-semibold text-sm sm:text-base truncate" style={{ color: GREEN }}>
                              {r.playerName}
                            </p>
                            <p className="text-[11px]" style={{ color: MUTED }}>HCP {r.hcp ?? "-"}</p>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className={cn("font-inter text-sm font-semibold", getScoreTextColor(r.r1))}>
                              {r.r1 && r.r1 !== "-" ? r.r1 : "–"}
                            </span>
                            {r.r1Thru && (
                              <div className="text-[10px] leading-tight" style={{ color: MUTED }}>
                                {r.r1Thru === "F" ? "F" : `Thru ${r.r1Thru}`}
                              </div>
                            )}
                          </div>
                          <div className="col-span-2 text-center">
                            <span className={cn("font-inter text-sm font-semibold", getScoreTextColor(r.r2))}>
                              {r.r2 && r.r2 !== "-" ? r.r2 : "–"}
                            </span>
                            {r.r2Thru && (
                              <div className="text-[10px] leading-tight" style={{ color: MUTED }}>
                                {r.r2Thru === "F" ? "F" : `Thru ${r.r2Thru}`}
                              </div>
                            )}
                          </div>
                          <div className="hidden sm:block sm:col-span-2 text-center font-bold text-sm" style={{ color: GREEN }}>
                            {r.total}
                          </div>
                          <div className="col-span-2 sm:col-span-1 text-center">
                            <span className={cn("px-2 py-0.5 rounded font-bold text-xs", toParColor(r.toPar))}>
                              {r.toPar}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )}
              <FooterCTA href="/embed/leaderboard?tab=weekly" label="Full leaderboard" />
            </div>

          )}
        </div>
      </section>

      {/* MONTHLY */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: BORDER }}>
          <button
            onClick={() => setMonthlyOpen(!monthlyOpen)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[hsl(37,100%,97%)] transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: CREAM_DEEP, color: GREEN }}>
                <Calendar className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded text-white mb-1" style={{ backgroundColor: GREEN }}>
                  Monthly
                </span>
                <h3 className="font-black text-lg leading-tight" style={{ color: GREEN, fontFamily: "'Archivo', system-ui, sans-serif" }}>
                  Monthly Winner Race
                </h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
                  {currentMonth} · Top of the table takes the title
                </p>
              </div>
            </div>
            <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", monthlyOpen && "rotate-180")} style={{ color: MUTED }} />
          </button>
          {monthlyOpen && (
            <div className="border-t" style={{ borderColor: BORDER }}>
              <div className="px-5 py-2">
                {monthlyLoading ? (
                  <LoadingRow />
                ) : monthlyStandings.length === 0 ? (
                  <EmptyState text="The month is just getting started." />
                ) : (
                  <div className="divide-y" style={{ borderColor: BORDER }}>
                    {monthlyStandings.slice(0, 6).map((s, i) => {
                      const pos = (scoreType === "net" ? s.net_position : s.gross_position) ?? i + 1;
                      const pts = scoreType === "net" ? s.monthly_net_points : s.monthly_gross_points;
                      return (
                        <div key={s.id} className="flex items-center gap-3 py-2.5">
                          <div className="w-7 flex justify-center">
                            {positionIcon(pos) || (
                              <span className="font-bold text-sm" style={{ color: pos <= 3 ? GREEN : MUTED }}>
                                {pos}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate" style={{ color: GREEN }}>
                              {s.player_name}
                            </p>
                            <p className="text-[11px]" style={{ color: MUTED }}>{s.tournaments_played} played</p>
                          </div>
                          <div className="font-black text-lg" style={{ color: ORANGE }}>{pts ?? 0}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <FooterCTA href="/embed/leaderboard?tab=monthly" label="Full standings" />
            </div>
          )}
        </div>
      </section>

      {/* WEDNESDAY AMBROSE */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: BORDER }}>
          <button
            onClick={() => setAmbroseOpen(!ambroseOpen)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[hsl(37,100%,97%)] transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: CREAM_DEEP, color: GREEN }}>
                <Target className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded text-white mb-1" style={{ backgroundColor: ORANGE }}>
                  Wednesday Nights
                </span>
                <h3 className="font-black text-lg leading-tight" style={{ color: GREEN, fontFamily: "'Archivo', system-ui, sans-serif" }}>
                  2-Man Ambrose
                </h3>
                <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
                  Grab a partner, combine handicaps, alternate shots
                </p>
              </div>
            </div>
            <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform duration-200", ambroseOpen && "rotate-180")} style={{ color: MUTED }} />
          </button>
          {ambroseOpen && (
            <div className="border-t" style={{ borderColor: BORDER }}>
              <div className="p-5">
                <div
                  className="relative overflow-hidden rounded-3xl p-6 sm:p-10"
                  style={{ background: `linear-gradient(135deg, ${GREEN} 0%, hsl(128,42%,15%) 100%)` }}
                >
                  <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full opacity-20"
                    style={{ background: `radial-gradient(circle, ${ORANGE} 0%, transparent 70%)` }} />

                  <div className="relative grid lg:grid-cols-5 gap-8 items-start">
                    <div className="lg:col-span-2">
                      <h2 className="text-white font-black text-3xl sm:text-4xl leading-none mb-3"
                        style={{ fontFamily: "'Archivo', 'Impact', sans-serif" }}>
                        2-MAN AMBROSE
                      </h2>
                      <p className="text-white/75 mb-6">
                        Grab a partner, combine handicaps, alternate shots and battle for the weekly pot.
                        $20 entry per team. Winner takes home credit + the bragging rights.
                      </p>
                      {nextAmbrose && (
                        <div className="mb-6 px-4 py-3 rounded-xl bg-white/10 border border-white/15">
                          <div className="text-[11px] uppercase tracking-widest text-white/60 mb-1">Next comp</div>
                          <div className="text-white font-bold">
                            {format(new Date(nextAmbrose.date + "T00:00:00"), "EEEE dd MMMM")}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <a href="/comp/find-partner"
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-bold text-sm transition-transform hover:scale-[1.03]"
                          style={{ backgroundColor: ORANGE, color: "white" }}>
                          Find a Partner <ChevronRight className="h-4 w-4" />
                        </a>
                        <a href="/comp/register-team"
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-bold text-sm border border-white/30 text-white hover:bg-white/10 transition-colors">
                          Register a Team
                        </a>
                      </div>
                    </div>

                    <div className="lg:col-span-3">
                      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: CREAM_DEEP }}>
                          <div>
                            <div className="text-[11px] uppercase tracking-widest font-bold" style={{ color: MUTED }}>
                              Latest results
                            </div>
                            <div className="font-bold text-sm" style={{ color: GREEN }}>
                              {ambroseComp ? format(new Date(ambroseComp.date + "T00:00:00"), "EEE dd MMM") : ","}
                            </div>
                          </div>
                          {ambroseComp?.status === "completed" && (
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded"
                              style={{ backgroundColor: GREEN, color: "white" }}>Final</span>
                          )}
                        </div>
                        {sortedAmbroseTeams.length === 0 ? (
                          <div className="px-5 py-10 text-center text-sm" style={{ color: MUTED }}>
                            No comp results yet, check back Wednesday night.
                          </div>
                        ) : (
                          <div className="divide-y" style={{ borderColor: BORDER }}>
                            {sortedAmbroseTeams.map((t: any, i: number) => (
                              <div key={t.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center">
                                <div className="col-span-1">
                                  {positionIcon(i + 1) || <span className="font-bold text-sm" style={{ color: MUTED }}>{i + 1}</span>}
                                </div>
                                <div className="col-span-7">
                                  <p className="font-bold text-sm truncate" style={{ color: GREEN }}>{t.team_name}</p>
                                  <p className="text-[11px] truncate" style={{ color: MUTED }}>
                                    {t.player1_name} & {t.player2_name}
                                  </p>
                                </div>
                                <div className="col-span-2 text-center text-xs" style={{ color: MUTED }}>
                                  {t.gross_score ?? "-"}
                                </div>
                                <div className="col-span-2 text-center font-black text-lg" style={{ color: ORANGE }}>
                                  {t.net_score ?? "-"}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>


      {/* CTA STRIP */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <div className="rounded-3xl p-8 sm:p-12 text-center" style={{ backgroundColor: GREEN }}>
          <h3 className="text-white font-black text-3xl sm:text-5xl mb-3"
            style={{ fontFamily: "'Archivo', system-ui, sans-serif" }}>
            READY TO TEE IT UP?
          </h3>
          <p className="text-white/70 mb-6 max-w-xl mx-auto">
            Book a bay, play your weekly rounds, climb the leaderboard.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href={hubUrl(tenant, "/pages/membership")}
              className="px-6 py-3 rounded-full font-black uppercase tracking-wider text-sm transition-transform hover:scale-[1.03]"
              style={{ backgroundColor: ORANGE, color: "white" }}>
              Join the League
            </a>
            <a href={hubUrl(tenant, "/booking")}
              className="px-6 py-3 rounded-full font-black uppercase tracking-wider text-sm border-2 border-white/30 text-white hover:bg-white/10 transition-colors">
              Book a Bay
            </a>
          </div>
        </div>
      </section>

      <div className="text-center pb-6 text-xs" style={{ color: MUTED }}>
        Powered by {tenant.venue_name} League Hub · Live updates every minute
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function FooterCTA({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="block px-5 py-3 border-t text-xs font-bold uppercase tracking-widest text-center transition-colors hover:bg-[hsl(37,100%,97%)]"
      style={{ borderColor: BORDER, color: ORANGE }}>
      {label} →
    </a>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: ORANGE }} />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm" style={{ color: MUTED }}>
      {text}
    </div>
  );
}

function HowCard({ icon, tag, title, desc, prize }: { icon: React.ReactNode; tag: string; title: string; desc: string; prize: string }) {
  return (
    <div className="bg-white rounded-2xl border p-6 shadow-sm hover:shadow-md transition-shadow" style={{ borderColor: BORDER }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: CREAM_DEEP, color: GREEN }}>
        {icon}
      </div>
      <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: ORANGE }}>{tag}</div>
      <h4 className="font-black text-xl mb-2" style={{ color: GREEN, fontFamily: "'Archivo', system-ui, sans-serif" }}>{title}</h4>
      <p className="text-sm mb-4 leading-relaxed" style={{ color: MUTED }}>{desc}</p>
      <div className="text-sm font-bold pt-3 border-t" style={{ borderColor: BORDER, color: GREEN }}>
        🏆 {prize}
      </div>
    </div>
  );
}
