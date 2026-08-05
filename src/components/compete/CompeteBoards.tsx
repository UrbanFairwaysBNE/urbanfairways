import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Award, Flame, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import { useSGTTournamentStandings } from "@/hooks/useSGTEmbedData";
import { TournamentStatsView } from "@/components/sgt/TournamentStatsView";
import { cn } from "@/lib/utils";
import { useTenant } from "@/config/tenant";

/* Brand tokens, matched to the embeddable leaderboards so the boards render
   identically on the website and inside an iframe. */
export const GREEN = "hsl(218,13%,13%)";
export const ORANGE = "hsl(93,15%,38%)";
export const CREAM = "hsl(40,29%,94%)";
export const CREAM_DEEP = "hsl(37,40%,90%)";
export const MUTED = "hsl(128,20%,40%)";
export const BORDER = "hsl(128,20%,85%)";

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

export const positionIcon = (pos: number) => {
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

export function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin" style={{ color: MUTED }} />
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm" style={{ color: MUTED }}>
      {text}
    </div>
  );
}

export function FooterCTA({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block px-5 py-3 border-t text-xs font-bold uppercase tracking-widest text-center transition-colors hover:bg-[hsl(40,29%,97%)]"
      style={{ borderColor: BORDER, color: ORANGE }}
    >
      {label} →
    </a>
  );
}

function BoardShell({
  title,
  subtitle,
  scoreType,
  setScoreType,
  children,
  footer,
  extra,
}: {
  title: string;
  subtitle?: string;
  scoreType: "net" | "gross";
  setScoreType: (t: "net" | "gross") => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ backgroundColor: CREAM }} className="rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2
            className="font-black text-2xl sm:text-3xl leading-none"
            style={{ color: GREEN, fontFamily: "'Montserrat', system-ui, sans-serif" }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: MUTED }}>
              <Flame className="h-3.5 w-3.5" style={{ color: ORANGE }} />
              {subtitle}
            </p>
          )}
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
      {extra}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: BORDER }}>
        {children}
        {footer}
      </div>
    </div>
  );
}

/* ---------------- Weekly league board ---------------- */

export function WeeklyLeagueBoard() {
  const { tenant } = useTenant();
  const [scoreType, setScoreType] = useState<"net" | "gross">("net");
  const [view, setView] = useState<"scores" | "stats">("scores");
  const { currentTournament, previousTournament, isLoading: tourLoading } = useActiveTourData();

  const tournamentId = currentTournament?.tournament_id ?? previousTournament?.tournament_id ?? null;
  const isCompleted = (currentTournament ?? previousTournament)?.status === "Completed";

  const { standings, isLoading } = useSGTTournamentStandings({
    id: tournamentId,
    scoreType,
    enabled: !!tournamentId,
    refreshInterval: 60000,
  });

  return (
    <BoardShell
      title="This week's leaderboard"
      subtitle={`${currentTournament?.name ?? previousTournament?.name ?? `${tenant.venue_name} Tour`} · live, refreshes every minute`}
      scoreType={scoreType}
      setScoreType={setScoreType}
      footer={<FooterCTA href="/embed/leaderboard?tab=weekly" label="Full leaderboard" />}
      extra={
        <div className="flex justify-center mb-4">
          <div className="flex rounded-full overflow-hidden p-1" style={{ backgroundColor: CREAM_DEEP }}>
            {(["scores", "stats"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-all"
                style={{
                  backgroundColor: view === v ? GREEN : "transparent",
                  color: view === v ? "white" : MUTED,
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {view === "stats" ? (
        <div className="px-5 py-4">
          {tournamentId ? (
            <TournamentStatsView tournamentId={tournamentId} isCompleted={isCompleted} />
          ) : (
            <EmptyState text="No tournament yet." />
          )}
        </div>
      ) : (
        <div className="px-5 py-2">
          {tourLoading || isLoading ? (
            <LoadingRow />
          ) : standings.length === 0 ? (
            <EmptyState text="No scores yet this week, be the first on the board." />
          ) : (
            <div>
              <div
                className="grid grid-cols-12 gap-2 py-2 items-center text-[10px] font-bold uppercase tracking-wider border-b"
                style={{ color: MUTED, borderColor: BORDER }}
              >
                <div className="col-span-1" />
                <div className="col-span-5 sm:col-span-4">Player</div>
                <div className="col-span-2 text-center">R1</div>
                <div className="col-span-2 text-center">R2</div>
                <div className="hidden sm:block sm:col-span-2 text-center">Total</div>
                <div className="col-span-2 sm:col-span-1 text-center">+/-</div>
              </div>
              <div className="divide-y" style={{ borderColor: BORDER }}>
                {standings.slice(0, 12).map((r) => (
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
                      <p className="text-[11px]" style={{ color: MUTED }}>
                        HCP {r.hcp ?? "-"}
                      </p>
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
                      <span className={cn("px-2 py-0.5 rounded font-bold text-xs", toParColor(r.toPar))}>{r.toPar}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </BoardShell>
  );
}

/* ---------------- Monthly standings board ---------------- */

export function MonthlyBoard() {
  const [scoreType, setScoreType] = useState<"net" | "gross">("net");
  const { activeTour } = useActiveTourData();

  const currentMonth = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  });

  const { data: standings = [], isLoading } = useQuery<MonthlyStanding[]>({
    queryKey: ["compete-monthly", activeTour?.tour_id, currentMonth, scoreType],
    enabled: !!activeTour?.tour_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_monthly_standings")
        .select("*")
        .eq("tour_id", activeTour!.tour_id)
        .eq("month", currentMonth)
        .order(scoreType === "net" ? "net_position" : "gross_position", { ascending: true })
        .limit(15);
      if (error) throw error;
      return (data as MonthlyStanding[]) ?? [];
    },
    refetchInterval: 60000,
  });

  return (
    <BoardShell
      title={`${currentMonth} standings`}
      subtitle="Top of the table at month's end takes the title"
      scoreType={scoreType}
      setScoreType={setScoreType}
      footer={<FooterCTA href="/embed/leaderboard?tab=monthly" label="Full standings" />}
    >
      <div className="px-5 py-2">
        {isLoading ? (
          <LoadingRow />
        ) : standings.length === 0 ? (
          <EmptyState text="The month is just getting started." />
        ) : (
          <div className="divide-y" style={{ borderColor: BORDER }}>
            {standings.map((s, i) => {
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
                    <p className="text-[11px]" style={{ color: MUTED }}>
                      {s.tournaments_played} played
                    </p>
                  </div>
                  <div className="font-black text-lg" style={{ color: ORANGE }}>
                    {pts ?? 0}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BoardShell>
  );
}

/* ---------------- Ambrose board ---------------- */

export function AmbroseBoard() {
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

  const { data: teams = [] } = useQuery({
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

  const sorted = useMemo(() => {
    return [...teams].sort((a: any, b: any) => {
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

  return (
    <div style={{ backgroundColor: CREAM }} className="rounded-3xl p-4 sm:p-6">
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: CREAM_DEEP }}>
          <div>
            <div className="text-[11px] uppercase tracking-widest font-bold" style={{ color: MUTED }}>
              Latest results
            </div>
            <div className="font-black text-lg" style={{ color: GREEN }}>
              {ambroseComp ? format(new Date(ambroseComp.date + "T00:00:00"), "EEE dd MMM") : "No comp yet"}
            </div>
          </div>
          {ambroseComp?.status === "completed" && (
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded"
              style={{ backgroundColor: GREEN, color: "white" }}
            >
              Final
            </span>
          )}
        </div>
        {sorted.length === 0 ? (
          <EmptyState text="No comp results yet, check back Wednesday night." />
        ) : (
          <div className="divide-y" style={{ borderColor: BORDER }}>
            {sorted.map((t: any, i: number) => (
              <div key={t.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center">
                <div className="col-span-1">
                  {positionIcon(i + 1) || (
                    <span className="font-bold text-sm" style={{ color: MUTED }}>
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="col-span-7">
                  <p className="font-bold text-sm truncate" style={{ color: GREEN }}>
                    {t.team_name}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: MUTED }}>
                    {t.player1_name} &amp; {t.player2_name}
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
        <FooterCTA href="/compete/local-comp-leaderboard" label="Full comp leaderboard" />
      </div>
    </div>
  );
}

export function useNextAmbrose() {
  return useQuery({
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
}

export { ChevronRight };
