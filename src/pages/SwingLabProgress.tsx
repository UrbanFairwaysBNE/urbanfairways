import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Info as InfoIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import swingLabBadge from "@/assets/swing-lab-badge.png.asset.json";
import { detectDistanceUnit, detectSpeedUnit, convertDistance, convertSpeed, type Shot, type DistanceUnit, type SpeedUnit } from "@/lib/range-stats";

type Session = { id: string; session_date: string };

type Timeframe = "30" | "90" | "180" | "365";
const TF_LABEL: Record<Timeframe, string> = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "180": "Last 6 months",
  "365": "Last 12 months",
};

type Direction = "up" | "down" | "flat";
type TileDef = {
  key: string;
  label: string;
  info: string;
  higherIsBetter: boolean;
  fmt: (v: number) => string;
  // returns metric value for a set of shots, or null if not enough data
  compute: (shots: Shot[], sessCount: number, days: number) => number | null;
};

function classify(club: string | null | undefined): "driver_woods" | "iron" | "wedge" | "other" {
  const c = (club || "").toLowerCase().replace(/[\s-]+/g, "");
  if (!c) return "other";
  // Driver + fairway woods + hybrids (e.g. dr, driver, 1w, 3w, 5w, w3, 3wood, 3h, 5h, h5, hybrid3)
  if (c === "dr" || c === "driver" || c === "d") return "driver_woods";
  if (/^\d+w(ood)?$/.test(c) || /^w\d+$/.test(c) || /^\d+wood$/.test(c)) return "driver_woods";
  if (/^\d+h(yb(rid)?)?$/.test(c) || /^h\d+$/.test(c) || /^hybrid\d*$/.test(c)) return "driver_woods";
  if (/^(pw|gw|aw|sw|lw)$/.test(c) || c === "w" || /^([4-6]\d)$/.test(c)) return "wedge";
  if (/^[2-9]i$/.test(c) || /^i[2-9]$/.test(c)) return "iron";
  return "other";
}

// Aggregate helpers
function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

// Group shots by club, keeping only clubs with >= minShots.
function byClub(shots: Shot[], minShots: number, filter?: (c: string) => boolean) {
  const m = new Map<string, Shot[]>();
  for (const s of shots) {
    const c = s.club_type || "";
    if (!c) continue;
    if (filter && !filter(c)) continue;
    const arr = m.get(c) ?? [];
    arr.push(s);
    m.set(c, arr);
  }
  for (const [k, v] of m) if (v.length < minShots) m.delete(k);
  return m;
}


export default function SwingLabProgress() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [tf, setTf] = useState<Timeframe>("30");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/");
  }, [isLoading, isAuthenticated, navigate]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["progress-sessions", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Session[]> => {
      const { data, error } = await supabase
        .from("range_sessions")
        .select("id, session_date")
        .eq("user_id", user!.id)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data as Session[];
    },
  });

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  const { data: shotsRaw = [] } = useQuery({
    queryKey: ["progress-shots", user?.id, sessionIds.length],
    enabled: !!user?.id && sessionIds.length > 0,
    queryFn: async (): Promise<Shot[]> => {
      const { data, error } = await supabase
        .from("range_shots")
        .select("*")
        .in("session_id", sessionIds);
      if (error) throw error;
      return data as Shot[];
    },
  });

  const srcDist = useMemo(() => detectDistanceUnit(shotsRaw), [shotsRaw]);
  const srcSpd = useMemo(() => detectSpeedUnit(shotsRaw), [shotsRaw]);

  // Read the user's global unit preference (shared with SwingLab overview via localStorage).
  const readPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    const v = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  };
  const [distPref, setDistPref] = useState<DistanceUnit>(() => readPref("range.distUnit", ["m", "yd"] as const, "yd"));
  const [spdPref, setSpdPref] = useState<SpeedUnit>(() => readPref("range.spdUnit", ["mph", "kph"] as const, "mph"));

  // Keep in sync if the preference changes in another tab, or when returning to this page.
  useEffect(() => {
    const sync = () => {
      setDistPref(readPref("range.distUnit", ["m", "yd"] as const, srcDist));
      setSpdPref(readPref("range.spdUnit", ["mph", "kph"] as const, srcSpd));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [srcDist, srcSpd]);

  const activeDist: DistanceUnit = distPref;
  const activeSpd: SpeedUnit = spdPref;

  // Convert every shot to the user's chosen display unit.
  const shots = useMemo(() => shotsRaw.map((s) => ({
    ...s,
    carry: convertDistance(s.carry, srcDist, activeDist),
    ball_speed: convertSpeed(s.ball_speed, srcSpd, activeSpd),
    club_speed: convertSpeed(s.club_speed, srcSpd, activeSpd),
    side_carry: convertDistance(s.side_carry, srcDist, activeDist),
  })), [shotsRaw, srcDist, srcSpd, activeDist, activeSpd]);

  const sessionDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) m.set(s.id, s.session_date);
    return m;
  }, [sessions]);

  const windows = useMemo(() => {
    const days = Number(tf);
    const now = Date.now();
    const winMs = days * 24 * 60 * 60 * 1000;
    const current: Shot[] = [];
    const prior: Shot[] = [];
    const currentSess: Session[] = [];
    const priorSess: Session[] = [];
    for (const s of shots) {
      const d = sessionDate.get(s.session_id) ?? s.shot_timestamp;
      if (!d) continue;
      const ms = new Date(d).getTime();
      const age = now - ms;
      if (age <= winMs) current.push(s);
      else if (age <= winMs * 2) prior.push(s);
    }
    for (const s of sessions) {
      const ms = new Date(s.session_date).getTime();
      const age = now - ms;
      if (age <= winMs) currentSess.push(s);
      else if (age <= winMs * 2) priorSess.push(s);
    }
    return { current, prior, currentSess, priorSess, days };
  }, [shots, sessions, sessionDate, tf]);

  const dLbl = activeDist;
  const sLbl = activeSpd;

  const tiles: TileDef[] = useMemo(() => [
    {
      key: "consistency",
      label: "Consistency",
      info: "Are you getting more consistent? Across every club with enough shots we measure both carry standard deviation and left/right dispersion, express each as a % of the club's average carry, and convert to a 0–100 score. Higher = tighter and more repeatable.",
      higherIsBetter: true,
      fmt: (v) => `${Math.round(v)} / 100`,
      compute: (shots) => {
        const groups = byClub(shots, 5);
        if (groups.size === 0) return null;
        const cvs: number[] = [];
        for (const [, arr] of groups) {
          const carries = arr.map((s) => s.carry).filter((v): v is number => v != null && v > 0);
          if (carries.length < 5) continue;
          const avgCarry = mean(carries);
          if (avgCarry <= 0) continue;
          const carrySd = sd(carries);
          cvs.push(carrySd / avgCarry);
          const sides = arr.map((s) => s.side_carry).filter((v): v is number => v != null && Number.isFinite(v));
          if (sides.length >= 5) cvs.push(sd(sides) / avgCarry);
        }
        if (cvs.length === 0) return null;
        const avgCv = mean(cvs);
        return Math.max(0, Math.min(100, 100 - avgCv * 400));
      },
    },
    {
      key: "speed",
      label: `Speed (${sLbl})`,
      info: "Are you swinging faster? For every club with enough shots we take your average ball speed and clubhead speed, then average across clubs so a change in club mix doesn't skew the number. Higher = more raw power.",
      higherIsBetter: true,
      fmt: (v) => `${v.toFixed(1)} ${sLbl}`,
      compute: (shots) => {
        const groups = byClub(shots, 5);
        if (groups.size === 0) return null;
        const perClub: number[] = [];
        for (const [, arr] of groups) {
          const speeds: number[] = [];
          for (const s of arr) {
            if (s.ball_speed != null && s.ball_speed > 0) speeds.push(s.ball_speed);
            if (s.club_speed != null && s.club_speed > 0) speeds.push(s.club_speed);
          }
          if (speeds.length >= 5) perClub.push(mean(speeds));
        }
        return perClub.length > 0 ? mean(perClub) : null;
      },
    },
    {
      key: "driver_woods_dispersion",
      label: `Driver/Woods Dispersion (${dLbl})`,
      info: "Are your long-club shots getting more accurate? Standard deviation of left/right carry across your driver, fairway woods and hybrids. Lower = tighter, more fairways.",
      higherIsBetter: false,
      fmt: (v) => `± ${v.toFixed(1)} ${dLbl}`,
      compute: (shots) => {
        const vals = shots
          .filter((s) => classify(s.club_type) === "driver_woods")
          .map((s) => s.side_carry)
          .filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length >= 5 ? sd(vals) : null;
      },
    },
    {
      key: "iron_dispersion",
      label: `Iron Dispersion (${dLbl})`,
      info: "Are your irons getting more accurate? Standard deviation of left/right carry across all your irons (3i–9i). Lower = tighter approach shots.",
      higherIsBetter: false,
      fmt: (v) => `± ${v.toFixed(1)} ${dLbl}`,
      compute: (shots) => {
        const vals = shots
          .filter((s) => classify(s.club_type) === "iron")
          .map((s) => s.side_carry)
          .filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length >= 5 ? sd(vals) : null;
      },
    },
    {
      key: "wedge_dispersion",
      label: `Wedge Dispersion (${dLbl})`,
      info: "Are your wedges getting more accurate? Standard deviation of left/right carry across all your wedges (PW, GW, SW, LW). Lower = better scoring club control.",
      higherIsBetter: false,
      fmt: (v) => `± ${v.toFixed(1)} ${dLbl}`,
      compute: (shots) => {
        const vals = shots
          .filter((s) => classify(s.club_type) === "wedge")
          .map((s) => s.side_carry)
          .filter((v): v is number => v != null && Number.isFinite(v));
        return vals.length >= 5 ? sd(vals) : null;
      },
    },
    {
      key: "sessions",
      label: "Sessions / Week",
      info: "Are you playing enough to improve? Your average Swing Lab sessions per week over the window. Practice frequency drives improvement more than any single session.",
      higherIsBetter: true,
      fmt: (v) => v.toFixed(1),
      compute: (_shots, sessCount, days) => {
        const weeks = days / 7;
        return weeks > 0 ? sessCount / weeks : null;
      },
    },
  ], [dLbl, sLbl]);



  const results = tiles.map((t) => computeTile(t, windows));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b safe-area-top">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/swing-lab")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <img src={swingLabBadge.url} alt="Swing Lab" className="h-9 md:h-10 object-contain" />
          <div className="w-16" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-3xl">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-display leading-tight">My Progress</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Comparing {TF_LABEL[tf].toLowerCase()} vs the {windows.days} days before that.
            </p>
          </div>
          <Select value={tf} onValueChange={(v) => setTf(v as Timeframe)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TF_LABEL) as Timeframe[]).map((k) => (
                <SelectItem key={k} value={k}>{TF_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {results.map((r) => (
            <TrendTile key={r.key} result={r} />
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-6 leading-relaxed">
          Green means the metric is trending better than the previous period. Orange means little change. Red means it's slipping. Tiles need a minimum number of shots in both windows to show a trend.
        </p>
      </main>
    </div>
  );
}

// ---------- helpers ----------

type TileResult = {
  key: string;
  label: string;
  info: string;
  current: number | null;
  prior: number | null;
  deltaPct: number | null;
  direction: Direction | null;
  higherIsBetter: boolean;
  fmt: (v: number) => string;
  status: "improving" | "flat" | "declining" | "insufficient";
};

function computeTile(
  t: TileDef,
  w: { current: Shot[]; prior: Shot[]; currentSess: Session[]; priorSess: Session[]; days: number },
): TileResult {
  const current = t.compute(w.current, w.currentSess.length, w.days);
  const prior = t.compute(w.prior, w.priorSess.length, w.days);


  let deltaPct: number | null = null;
  let direction: Direction | null = null;
  let status: TileResult["status"] = "insufficient";
  if (current != null && prior != null && prior !== 0) {
    deltaPct = ((current - prior) / Math.abs(prior)) * 100;
    const abs = Math.abs(deltaPct);
    if (abs < 2) {
      direction = "flat";
      status = "flat";
    } else {
      direction = deltaPct > 0 ? "up" : "down";
      const better = (deltaPct > 0) === t.higherIsBetter;
      status = better ? "improving" : "declining";
    }
  } else if (current != null) {
    status = "flat";
  }

  return {
    key: t.key, label: t.label, info: t.info,
    current, prior, deltaPct, direction,
    higherIsBetter: t.higherIsBetter, fmt: t.fmt, status,
  };
}

function TrendTile({ result }: { result: TileResult }) {
  const styles = statusStyles(result.status);
  const Icon = result.direction === "up" ? TrendingUp : result.direction === "down" ? TrendingDown : Minus;
  return (
    <div className={`rounded-lg border-2 p-4 ${styles.border} ${styles.bg}`}>
      <div className={`text-[10px] uppercase tracking-widest flex items-center justify-between gap-1 ${styles.label}`}>
        <span>{result.label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`About ${result.label}`} className="opacity-80 hover:opacity-100">
              <InfoIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="max-w-[260px] text-xs leading-relaxed">
            {result.info}
          </PopoverContent>
        </Popover>
      </div>
      <div className={`text-2xl font-display mt-1 leading-tight ${styles.value}`}>
        {result.current != null ? result.fmt(result.current) : "—"}
      </div>
      <div className={`text-xs mt-1 flex items-center gap-1 ${styles.sub}`}>
        {result.deltaPct != null ? (
          <>
            <Icon className="h-3.5 w-3.5" />
            {result.status === "flat"
              ? "Little change"
              : `${result.deltaPct > 0 ? "+" : ""}${result.deltaPct.toFixed(1)}% vs prior`}
          </>
        ) : (
          <span className="text-muted-foreground">Not enough data yet</span>
        )}
      </div>
    </div>
  );
}

function statusStyles(status: TileResult["status"]) {
  switch (status) {
    case "improving":
      return {
        border: "border-emerald-600/60",
        bg: "bg-emerald-500/10",
        label: "text-emerald-800 dark:text-emerald-300",
        value: "text-emerald-900 dark:text-emerald-100",
        sub: "text-emerald-800 dark:text-emerald-300",
      };
    case "declining":
      return {
        border: "border-red-600/60",
        bg: "bg-red-500/10",
        label: "text-red-800 dark:text-red-300",
        value: "text-red-900 dark:text-red-100",
        sub: "text-red-800 dark:text-red-300",
      };
    case "flat":
      return {
        border: "border-amber-500/60",
        bg: "bg-amber-500/10",
        label: "text-amber-800 dark:text-amber-300",
        value: "text-amber-900 dark:text-amber-100",
        sub: "text-amber-800 dark:text-amber-300",
      };
    default:
      return {
        border: "border-border",
        bg: "bg-card",
        label: "text-muted-foreground",
        value: "text-foreground",
        sub: "text-muted-foreground",
      };
  }
}
