import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";


import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Info as InfoIcon } from "lucide-react";
import { PGA_TOUR_AVERAGES, matchTourClub, matchBenchmarkClub, METRIC_TOOLTIPS, BENCHMARK_LABELS, type TourAverage, type BenchmarkSet } from "@/lib/pga-tour-averages";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import swingLabBadge from "@/assets/uf-lab-circle-light.png";
import swingLabClipboard from "@/assets/swing-lab-clipboard.png.asset.json";
import { HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Settings2, FlaskConical } from "lucide-react";
import { ArrowLeft, Check, ChevronDown, Target, TrendingUp } from "lucide-react";
import {
  statsByClub, swingStatsByClub, sortClubs, fmt, mean, max,
  detectDistanceUnit, detectSpeedUnit, convertDistance, convertSpeed,
  trimOutliers, fitEllipse, clubColor,
  type Shot, type DistanceUnit, type SpeedUnit,
} from "@/lib/range-stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter, ReferenceLine, Customized,
  LineChart, Line, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

type Session = {
  id: string;
  session_date: string;
  started_at: string | null;
  ended_at: string | null;
  shot_count: number;
  duration_minutes: number | null;
  bay_id: string | null;
  source_filename: string | null;
  created_at: string;
};

export default function SwingLab() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [distUnit, setDistUnit] = useState<DistanceUnit | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("range.distUnit");
    return v === "m" || v === "yd" ? (v as DistanceUnit) : null;
  });
  const [spdUnit, setSpdUnit] = useState<SpeedUnit | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem("range.spdUnit");
    return v === "kph" || v === "mph" ? (v as SpeedUnit) : null;
  });
  const [trim, setTrim] = useState(() => {
    if (typeof window === "undefined") return true;
    const v = localStorage.getItem("range.trim");
    return v === null ? true : v === "1";
  });
  useEffect(() => { if (distUnit) localStorage.setItem("range.distUnit", distUnit); }, [distUnit]);
  useEffect(() => { if (spdUnit) localStorage.setItem("range.spdUnit", spdUnit); }, [spdUnit]);
  useEffect(() => { localStorage.setItem("range.trim", trim ? "1" : "0"); }, [trim]);
  const [activeTab, setActiveTab] = useState("overview");
  const [howToOpen, setHowToOpen] = useState(false);
  const [howToPage, setHowToPage] = useState(1);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/");
  }, [isLoading, isAuthenticated, navigate]);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["range-sessions", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Session[]> => {
      const { data, error } = await supabase
        .from("range_sessions")
        .select("id, session_date, started_at, ended_at, shot_count, duration_minutes, bay_id, source_filename, created_at")
        .eq("user_id", user!.id)
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Session[];
    },
  });

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  const { data: allShotsRaw = [] } = useQuery({
    queryKey: ["range-shots-all", user?.id, sessionIds.length],
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

  // Detect source units once when data first loads
  const sourceDistUnit = useMemo(() => detectDistanceUnit(allShotsRaw), [allShotsRaw]);
  const sourceSpdUnit = useMemo(() => detectSpeedUnit(allShotsRaw), [allShotsRaw]);
  useEffect(() => { if (distUnit === null && allShotsRaw.length) setDistUnit(sourceDistUnit); }, [sourceDistUnit, allShotsRaw.length, distUnit]);
  useEffect(() => { if (spdUnit === null && allShotsRaw.length) setSpdUnit(sourceSpdUnit); }, [sourceSpdUnit, allShotsRaw.length, spdUnit]);

  const activeDist: DistanceUnit = distUnit ?? sourceDistUnit;
  const activeSpd: SpeedUnit = spdUnit ?? sourceSpdUnit;

  // Convert every shot to the display unit, then optionally trim outliers.
  const allShots = useMemo(() => {
    const converted = allShotsRaw.map((s) => ({
      ...s,
      ball_speed: convertSpeed(s.ball_speed, sourceSpdUnit, activeSpd),
      club_speed: convertSpeed(s.club_speed, sourceSpdUnit, activeSpd),
      carry: convertDistance(s.carry, sourceDistUnit, activeDist),
      total: convertDistance(s.total, sourceDistUnit, activeDist),
      side_carry: convertDistance(s.side_carry, sourceDistUnit, activeDist),
      side_total: convertDistance(s.side_total, sourceDistUnit, activeDist),
      apex_height: convertDistance(s.apex_height, sourceDistUnit, activeDist),
    }));
    return trim ? trimOutliers(converted) : converted;
  }, [allShotsRaw, sourceDistUnit, sourceSpdUnit, activeDist, activeSpd, trim]);

  const dLbl = activeDist;
  const sLbl = activeSpd;

  const totalShots = allShots.length;
  const bestCarry = max(allShots.map((s) => s.carry));
  const avgBallSpeed = mean(allShots.map((s) => s.ball_speed));
  const avgSmash = mean(allShots.map((s) => s.smash_factor));
  const clubCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allShots) m.set(s.club_type || "Unknown", (m.get(s.club_type || "Unknown") ?? 0) + 1);
    return m;
  }, [allShots]);
  const mostUsedClub = useMemo(() => {
    let best = ""; let n = 0;
    for (const [c, cnt] of clubCounts) if (cnt > n) { best = c; n = cnt; }
    return best;
  }, [clubCounts]);

  const clubStats = useMemo(() => statsByClub(allShots), [allShots]);
  const swingStats = useMemo(() => swingStatsByClub(allShots), [allShots]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );
  const selectedShots = useMemo(
    () => (selectedSessionId ? allShots.filter((s) => s.session_id === selectedSessionId) : []),
    [allShots, selectedSessionId]
  );

  if (isLoading || sessionsLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading UF Lab data…</div>;
  }


  const unitBar = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm active:scale-[0.98] transition-transform text-xs">
          <Settings2 className="h-6 w-6 text-accent" />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Distance</DropdownMenuLabel>
        {(["m", "yd"] as DistanceUnit[]).map((u) => (
          <DropdownMenuItem
            key={u}
            onSelect={() => setDistUnit(u)}
            className={`cursor-pointer flex items-center justify-between ${activeDist === u ? "text-accent" : ""}`}
          >
            <span>{u === "m" ? "Meters (m)" : "Yards (yd)"}</span>
            {activeDist === u && <Check className="h-4 w-4 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Speed</DropdownMenuLabel>
        {(["kph", "mph"] as SpeedUnit[]).map((u) => (
          <DropdownMenuItem
            key={u}
            onSelect={() => setSpdUnit(u)}
            className={`cursor-pointer flex items-center justify-between ${activeSpd === u ? "text-accent" : ""}`}
          >
            <span>{u === "kph" ? "km/h" : "mph"}</span>
            {activeSpd === u && <Check className="h-4 w-4 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={trim}
          onCheckedChange={(v) => setTrim(!!v)}
          className="cursor-pointer [&_[data-state=checked]]:text-accent"
        >
          Hide outliers
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const TABS: { value: string; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "sessions", label: "Sessions" },
    { value: "gapping", label: "Gapping" },
    { value: "dispersion", label: "Dispersion" },
    { value: "swing", label: "Data" },
    { value: "optimise", label: "Optimise" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <header className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10 safe-area-top">
        <div className="max-w-6xl mx-auto px-4 pt-3 pb-2 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <img src={swingLabBadge} alt="UF Lab" className="h-12 md:h-14 w-auto object-contain rounded-full" />

            <Button variant="ghost" size="sm" className="-mr-2 border border-accent" onClick={() => setHowToOpen(true)}>
              <HelpCircle className="h-4 w-4 mr-1" /> How To
            </Button>
          </div>
        </div>
      </header>

      <Dialog open={howToOpen} onOpenChange={(o) => { setHowToOpen(o); if (!o) setHowToPage(1); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={swingLabBadge} alt="" className="h-6 w-6 rounded-full object-cover" />
              {howToPage === 1 ? "How to use UF Lab" : "How to customise your bag"}
            </DialogTitle>
          </DialogHeader>
          {howToPage === 1 ? (
            <div className="space-y-5 text-sm">
              <ol className="space-y-3 list-decimal pl-5">
                <li>Start a driving range session, ensuring you change to the correct club every time in the bottom left.</li>
                <li>
                  <div className="flex items-start gap-3 flex-wrap">
                    <span>Once you have completed your session, click the clipboard in the top left:</span>
                    <img
                      src={swingLabClipboard.url}
                      alt="GSPro clipboard icon"
                      className="h-12 w-12 rounded-md border border-border object-contain bg-background"
                    />
                  </div>
                </li>
                <li>Click <strong>Export to CSV</strong>.</li>
                <li><strong>Done!</strong> That's all you need to do — we take care of the rest and your session appears in UF Lab.</li>
              </ol>
              <div className="border-t border-border pt-4 space-y-2">
                <h4 className="font-semibold text-foreground">Tip</h4>
                <p className="text-muted-foreground">
                  You can remove any outlier or bad shots by clicking the clipboard and deleting the individual shots. UF Lab has a <strong>Hide Outliers</strong> filter too.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              <ol className="space-y-3 list-decimal pl-5">
                <li>Click your player name in the <strong>Players</strong> section.</li>
                <li>Click <strong>Golf Bag</strong>.</li>
                <li>Match up the bag to your actual clubs.</li>
                <li>Click <strong>Apply Updates</strong> to save your bag.</li>
              </ol>
              <p className="text-xs text-muted-foreground">Your bag setup is saved to your profile and will be applied to your future sessions automatically.</p>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHowToPage(howToPage === 1 ? 2 : 1)}
            >
              {howToPage === 1 ? "Customise your bag →" : "← UF Lab basics"}
            </Button>
            <span className="text-xs text-muted-foreground">{howToPage} / 2</span>
          </div>
        </DialogContent>
      </Dialog>


      <main className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Target className="h-10 w-10 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">No UF Lab sessions yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                UF Lab data is captured when you hit <strong>Export</strong> in the GSPro driving range and finish your session.
                Your shots will appear here automatically after your booking ends.
              </p>
            </CardContent>
          </Card>
        ) : selectedSession ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedSessionId(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> All sessions
              </Button>
              {unitBar}
            </div>
            <SessionDetail
              session={selectedSession}
              shots={selectedShots}
              dLbl={dLbl}
              sLbl={sLbl}
            />
          </>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              {/* Menu-style top nav — dropdown */}
              <div className="flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2.5 bg-card border border-border rounded-lg px-5 py-3 shadow-sm active:scale-[0.98] transition-transform">
                      <span className="font-display text-xl uppercase tracking-wide text-primary">
                        {TABS.find((t) => t.value === activeTab)?.label}
                      </span>
                      <ChevronDown className="h-5 w-5 text-accent" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[240px]">
                    {TABS.map((t) => (
                      <DropdownMenuItem
                        key={t.value}
                        onSelect={() => setActiveTab(t.value)}
                        className={`font-display uppercase tracking-wide text-base py-2.5 cursor-pointer ${
                          activeTab === t.value ? "text-accent bg-accent/10" : "text-foreground"
                        }`}
                      >
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Context row: averages label + units */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">My Averages</div>
                  <div className="text-sm text-foreground">
                    {totalShots} shots · {sessions.length} sessions
                  </div>
                </div>
                {unitBar}
              </div>

              <TabsContent value="overview" className="space-y-4">
                <OverviewTiles
                  sessions={sessions}
                  shots={allShots}
                  activeDist={activeDist}
                  activeSpd={activeSpd}
                />
              </TabsContent>

              <TabsContent value="gapping" className="space-y-4">
                <Card className="overflow-hidden">
                  <CardHeader><CardTitle className="text-base">Average distances by club ({dLbl})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/60">
                      <div className="grid grid-cols-[1fr_6rem_6rem] items-center px-4 py-2 text-xs text-muted-foreground font-sans uppercase tracking-wider">
                        <div>Club</div>
                        <div className="text-center">Carry</div>
                        <div className="text-right">Total</div>
                      </div>
                      {clubStats.map((c) => (
                        <div key={c.club} className="grid grid-cols-[1fr_6rem_6rem] items-center px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-display text-lg font-bold uppercase tracking-wide text-accent truncate border-2 border-accent rounded-full px-3 py-0.5">
                              {c.club}
                            </span>
                          </div>
                          <div className="font-display text-xl text-primary tabular-nums text-center">
                            {c.avgCarry != null ? Math.round(c.avgCarry) : "—"}
                            <span className="text-xs text-muted-foreground font-sans ml-1">{dLbl}</span>
                          </div>
                          <div className="font-display text-xl text-primary tabular-nums text-right">
                            {c.avgTotal != null ? Math.round(c.avgTotal) : "—"}
                            <span className="text-xs text-muted-foreground font-sans ml-1">{dLbl}</span>
                          </div>

                        </div>
                      ))}
                      {clubStats.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">No club data yet</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="dispersion" className="space-y-4">
                <DispersionChart shots={allShots} dLbl={dLbl} sessions={sessions} />
              </TabsContent>


              <TabsContent value="swing" className="space-y-4">
                <ClubStatsTable rows={clubStats} dLbl={dLbl} sLbl={sLbl} />
                <SwingStatsTable rows={swingStats} />
              </TabsContent>


              <TabsContent value="optimise" className="space-y-4">
                <OptimiseTab
                  clubStats={clubStats}
                  swingStats={swingStats}
                  activeDist={activeDist}
                  activeSpd={activeSpd}
                />
              </TabsContent>

              <TabsContent value="sessions" className="space-y-3">
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="w-full border border-border rounded-md p-3 hover:bg-muted/50 transition flex items-center justify-between gap-3"
                    >
                      <button
                        onClick={() => setSelectedSessionId(s.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="font-medium">
                          {format(parseISO(s.session_date), "EEE d MMM yyyy")}
                          {s.started_at && (
                            <span className="text-muted-foreground text-sm ml-2">
                              {format(parseISO(s.started_at), "h:mma").toLowerCase()}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.shot_count} shots
                          {s.duration_minutes ? ` · ${Math.round(s.duration_minutes)} min` : ""}
                          {s.source_filename ? ` · ${s.source_filename}` : ""}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedSessionId(s.id)}>View</Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the session from{" "}
                                <strong>{format(parseISO(s.session_date), "EEE d MMM yyyy")}</strong>
                                {" "}and all {s.shot_count} of its shots from the server. This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={async () => {
                                  const { error } = await supabase
                                    .from("range_sessions")
                                    .delete()
                                    .eq("id", s.id)
                                    .eq("user_id", user!.id);
                                  if (error) {
                                    toast.error("Couldn't delete session: " + error.message);
                                    return;
                                  }
                                  if (selectedSessionId === s.id) setSelectedSessionId(null);
                                  toast.success("Session deleted");
                                  queryClient.invalidateQueries({ queryKey: ["range-sessions"] });
                                  queryClient.invalidateQueries({ queryKey: ["range-shots-all"] });
                                }}
                              >
                                Delete permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function OverviewTiles({
  sessions, shots, activeDist, activeSpd,
}: {
  sessions: Session[];
  shots: Shot[];
  activeDist: DistanceUnit;
  activeSpd: SpeedUnit;
}) {
  const navigate = useNavigate();
  const dLbl = activeDist;


  // Session date lookup for shot attribution
  const sessionDateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) m.set(s.id, s.session_date);
    return m;
  }, [sessions]);

  // Tile 1 — Sessions (lifetime + this month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sessionsThisMonth = sessions.filter((s) => {
    const d = parseISO(s.session_date);
    return d >= monthStart;
  }).length;

  // Tile 2 — Shots + fun equivalence (~50 balls per bucket)
  const totalShots = shots.length;
  const buckets = Math.max(1, Math.round(totalShots / 50));

  // Tile 3 — Longest carry with physics-based plausibility filter
  // Convert both sides to yd + mph so a single cap works: carry_yd ≤ ballSpeed_mph × 2.0
  const longest = useMemo(() => {
    let best: { carry: number; club: string; date: string } | null = null;
    for (const s of shots) {
      if (s.carry == null || s.carry <= 0) continue;
      const carryYd = activeDist === "yd" ? s.carry : s.carry * M_TO_YD_LOCAL;
      const bs = s.ball_speed;
      if (bs != null && bs > 0) {
        const bsMph = activeSpd === "mph" ? bs : bs * 0.621371;
        if (carryYd > bsMph * 2.05) continue; // physically implausible
      } else {
        // No ball speed — hard cap on driver-ish upper bound
        if (carryYd > 340) continue;
      }
      if (!best || s.carry > best.carry) {
        const date = sessionDateById.get(s.session_id) ?? s.shot_timestamp ?? "";
        best = { carry: s.carry, club: s.club_type || "—", date };
      }
    }
    return best;
  }, [shots, activeDist, activeSpd, sessionDateById]);

  // Group shots by club (for tiles 4, 5, 6)
  const byClub = useMemo(() => {
    const m = new Map<string, Shot[]>();
    for (const s of shots) {
      const c = s.club_type || "Unknown";
      const arr = m.get(c) ?? [];
      arr.push(s);
      m.set(c, arr);
    }
    return m;
  }, [shots]);

  // Tile 4 — Best club (smash vs tour %)
  const bestVsTour = useMemo(() => {
    let best: { club: string; pct: number } | null = null;
    for (const [club, arr] of byClub) {
      if (arr.length < 10) continue;
      const tour = matchTourClub(club);
      if (!tour) continue;
      const smashes = arr.map((s) => s.smash_factor).filter((v): v is number => typeof v === "number" && v > 0 && v <= 1.55);
      if (smashes.length < 10) continue;
      const avg = smashes.reduce((a, b) => a + b, 0) / smashes.length;
      const pct = (avg / tour.smashFactor) * 100;
      if (!best || pct > best.pct) best = { club, pct };
    }
    return best;
  }, [byClub]);

  // Tile 5 — Consistency score (carry SD → 0–100)
  const consistency = useMemo(() => {
    const scoreFor = (subset: Shot[]) => {
      const groups = new Map<string, number[]>();
      for (const s of subset) {
        if (s.carry == null || s.carry <= 0) continue;
        const c = s.club_type || "Unknown";
        const arr = groups.get(c) ?? [];
        arr.push(s.carry);
        groups.set(c, arr);
      }
      // Top 3 most-hit clubs with ≥10 shots
      const top = Array.from(groups.entries())
        .filter(([, v]) => v.length >= 10)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 3);
      if (top.length === 0) return null;
      const cvs: number[] = [];
      for (const [, arr] of top) {
        const mn = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (mn <= 0) continue;
        const variance = arr.reduce((a, b) => a + (b - mn) * (b - mn), 0) / arr.length;
        const sd = Math.sqrt(variance);
        cvs.push(sd / mn);
      }
      if (cvs.length === 0) return null;
      const avgCv = cvs.reduce((a, b) => a + b, 0) / cvs.length;
      // 0% CV → 100, 20% CV → 0. Linear clamp.
      return Math.max(0, Math.min(100, Math.round(100 - avgCv * 500)));
    };

    const nowMs = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const recent: Shot[] = [];
    const prior: Shot[] = [];
    for (const s of shots) {
      const dateStr = sessionDateById.get(s.session_id) ?? s.shot_timestamp;
      if (!dateStr) { recent.push(s); continue; }
      const ms = new Date(dateStr).getTime();
      if (nowMs - ms <= monthMs) recent.push(s);
      else if (nowMs - ms <= monthMs * 2) prior.push(s);
    }
    const current = scoreFor(shots);
    const recentScore = scoreFor(recent);
    const priorScore = scoreFor(prior);
    const trend = recentScore != null && priorScore != null ? recentScore - priorScore : null;
    return { current, trend };
  }, [shots, sessionDateById]);

  // Tile 6 — Focus Point (biggest smash-efficiency deficit vs tour)
  const focus = useMemo(() => {
    let worst: { club: string; pct: number; avgSmash: number; tourSmash: number } | null = null;
    for (const [club, arr] of byClub) {
      if (arr.length < 10) continue;
      const tour = matchTourClub(club);
      if (!tour) continue;
      const smashes = arr.map((s) => s.smash_factor).filter((v): v is number => typeof v === "number" && v > 0 && v <= 1.55);
      if (smashes.length < 10) continue;
      const avg = smashes.reduce((a, b) => a + b, 0) / smashes.length;
      const pct = (avg / tour.smashFactor) * 100;
      if (pct >= 100) continue; // only surface deficits
      if (!worst || pct < worst.pct) worst = { club, pct, avgSmash: avg, tourSmash: tour.smashFactor };
    }
    return worst;
  }, [byClub]);

  return (
    <div className="space-y-3">
      {/* Full-width — My Progress (above stats) */}
      <button
        type="button"
        onClick={() => navigate("/swing-lab/progress")}
        className="w-full group rounded-lg border-2 border-accent/70 bg-accent/5 p-4 text-left transition-colors hover:bg-accent/10 active:bg-accent/15"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-accent flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />My Progress
            </div>
            <div className="text-lg font-display mt-1 leading-tight">Track your trends over time</div>
            <div className="text-xs text-muted-foreground mt-1">See which metrics are improving, flat, or slipping.</div>
          </div>
          <ChevronDown className="h-5 w-5 -rotate-90 text-accent group-hover:translate-x-0.5 transition-transform shrink-0" />
        </div>
      </button>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Tile 1 — Sessions */}
        <TileCard
          label="Sessions"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          value={sessions.length.toString()}
          sub={`${sessionsThisMonth} this month`}
          info="Total UF Lab sessions on your account. A session is one bay visit where shots were exported from GSPro."
        />

        {/* Tile 2 — Shots */}
        <TileCard
          label="Shots Hit"
          icon={<Target className="h-3.5 w-3.5" />}
          value={totalShots.toLocaleString()}
          sub={totalShots > 0 ? `≈ ${buckets} range bucket${buckets === 1 ? "" : "s"}` : "—"}
          info="Every shot you've captured in the UF Lab. Bucket equivalent assumes ~50 balls per range bucket."
        />

        {/* Tile 3 — Longest carry */}
        <TileCard
          label="Longest Carry"
          value={longest ? `${Math.round(longest.carry)} ${dLbl}` : "—"}
          sub={longest ? `${longest.club}${longest.date ? ` · ${format(parseISO(longest.date.slice(0, 10)), "d MMM")}` : ""}` : "Not enough data"}
          info={`Furthest carry (${dLbl}). The distance the ball flew in the air, not roll.`}
        />

        {/* Tile 4 — Best club vs tour */}
        <TileCard
          label="Best Club (vs Tour)"
          value={bestVsTour ? `${Math.round(bestVsTour.pct)}%` : "—"}
          sub={bestVsTour ? `${bestVsTour.club} smash efficiency` : "Need 10+ shots per club"}
          info="Your best club by smash factor (ball speed ÷ club speed) shown as a percentage of the PGA Tour average for that club. Smash measures strike quality, so it rewards pure contact over raw speed. A 70-year-old can still score 95%+."
        />

        {/* Tile 5 — Consistency */}
        <TileCard
          label="Consistency"
          value={consistency.current != null ? `${consistency.current} / 100` : "—"}
          sub={
            consistency.current == null
              ? "Need 10+ shots on a club"
              : consistency.trend == null
                ? "Trend after 30 days"
                : consistency.trend === 0
                  ? "Steady vs last month"
                  : `${consistency.trend > 0 ? "▲" : "▼"} ${Math.abs(consistency.trend)} vs last month`
          }
          highlight={consistency.trend != null && consistency.trend > 0}
          info="How repeatable your carry distances are, scored 0–100 (higher = tighter). We take the carry standard deviation for your three most-hit clubs, express it as a percent of each club's average, then convert to a score: 0% variation = 100, 20%+ variation = 0. Consistency is the number that actually moves with practice. Averages barely budge month to month, this does."
        />

        {/* Tile 6 — Focus Point (compact, orange-outlined, click for detail) */}
        <FocusPointCard focus={focus} />
      </div>
    </div>
  );
}



// Local re-export to avoid extra import churn.
const M_TO_YD_LOCAL = 1.09361;

function TileCard({
  label, value, sub, icon, highlight, info,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  info?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center justify-between gap-1">
          <span className="flex items-center gap-1">{icon}{label}</span>
          {info && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${label}`}
                  className="text-muted-foreground hover:text-accent active:text-accent transition-colors"
                >
                  <InfoIcon className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                {info}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="text-2xl font-display text-primary mt-1 leading-tight">{value}</div>
        {sub && (
          <div className={`text-xs mt-1 ${highlight ? "text-accent" : "text-muted-foreground"}`}>{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

function FocusPointCard({ focus }: { focus: { club: string; pct: number; avgSmash: number; tourSmash: number } | null }) {
  const [open, setOpen] = useState(false);
  const headline = focus ? `${focus.club} · ${Math.round(focus.pct)}%` : "All clean";
  const sub = focus ? "Tap for coaching cue" : "No clubs lagging tour";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left rounded-lg border-2 border-accent bg-card p-4 transition-colors hover:bg-accent/5 active:bg-accent/10"
      >
        <div className="text-xs uppercase tracking-wide text-accent flex items-center justify-between gap-1">
          <span className="flex items-center gap-1"><FlaskConical className="h-3.5 w-3.5" />Focus Point</span>
          <InfoIcon className="h-3.5 w-3.5 opacity-80" />
        </div>
        <div className="text-2xl font-display text-primary mt-1 leading-tight">{headline}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-accent" />
              Focus Point
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground/90 pt-2">
                {focus ? (
                  <>
                    <p className="font-display text-lg text-foreground">
                      {focus.club}: {Math.round(focus.pct)}% of tour smash
                    </p>
                    <p>
                      You're averaging a smash factor of <span className="font-semibold">{focus.avgSmash.toFixed(2)}</span> with your {focus.club}, versus the PGA Tour average of <span className="font-semibold">{focus.tourSmash.toFixed(2)}</span>.
                    </p>
                    <p>
                      Smash factor (ball speed ÷ club speed) is the purest measure of strike quality. Closing this gap means more ball speed and carry for the exact same swing effort, no extra club speed needed.
                    </p>
                    <p className="text-muted-foreground">
                      Next session: hit a focused block with this club. Slow your tempo, aim for centre-face contact, and watch the smash number climb.
                    </p>
                  </>
                ) : (
                  <p>Every club you've hit enough shots with is meeting or beating the PGA Tour smash benchmark. Keep grinding, a new focus point will appear as you build more data.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}


function Kpi({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {icon}{label}
        </div>
        <div className="text-2xl font-display text-primary mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function ClubStatsTable({ rows, dLbl, sLbl }: { rows: ReturnType<typeof statsByClub>; dLbl: string; sLbl: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Per-club statistics</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">Shots</TableHead>
              <TableHead className="text-right">Avg carry ({dLbl})</TableHead>
              <TableHead className="text-right">Max carry ({dLbl})</TableHead>
              <TableHead className="text-right">Avg total ({dLbl})</TableHead>
              <TableHead className="text-right">Ball ({sLbl})</TableHead>
              <TableHead className="text-right">Club ({sLbl})</TableHead>
              <TableHead className="text-right">Smash</TableHead>
              <TableHead className="text-right">Launch°</TableHead>
              <TableHead className="text-right">Spin</TableHead>
              <TableHead className="text-right">Lat. SD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.club}>
                <TableCell className="font-medium" style={{ color: clubColor(r.club) }}>{r.club}</TableCell>
                <TableCell className="text-right">{r.shots}</TableCell>
                <TableCell className="text-right">{fmt(r.avgCarry, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.maxCarry, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgTotal, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgBallSpeed, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgClubSpeed, 0)}</TableCell>

                <TableCell className="text-right">{fmt(r.avgSmash, 2)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgLaunch, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgSpin, 0)}</TableCell>
                <TableCell className="text-right">{fmt(r.lateralSd, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SwingStatsTable({ rows }: { rows: ReturnType<typeof swingStatsByClub> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Swing dynamics</CardTitle>
        <p className="text-xs text-muted-foreground">
          Positive = right / out-to-in for right-handers. Face-to-path shows shape tendency.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead className="text-right">Shots</TableHead>
              <TableHead className="text-right">Path°</TableHead>
              <TableHead className="text-right">Face°</TableHead>
              <TableHead className="text-right">Face-to-Path°</TableHead>
              <TableHead className="text-right">AoA°</TableHead>
              <TableHead className="text-right">Launch°</TableHead>
              <TableHead className="text-right">Spin axis°</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.club}>
                <TableCell className="font-medium" style={{ color: clubColor(r.club) }}>{r.club}</TableCell>
                <TableCell className="text-right">{r.shots}</TableCell>
                <TableCell className="text-right">{fmt(r.avgPath, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgFace, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgFaceToPath, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgAoA, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgLaunch, 1)}</TableCell>
                <TableCell className="text-right">{fmt(r.avgSpinAxis, 1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DispersionChart({ shots, dLbl, sessions }: { shots: Shot[]; dLbl: string; sessions?: Session[] }) {
  type DateRange = "all" | "30" | "60" | "90" | "180" | "365";
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [isMobileChart, setIsMobileChart] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const handleChange = () => setIsMobileChart(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  // Session id -> date map
  const sessionDateMap = useMemo(() => {
    const m = new Map<string, string>();
    (sessions ?? []).forEach((s) => m.set(s.id, s.session_date));
    return m;
  }, [sessions]);

  // Sessions in scope after applying date range (or all if no sessions prop)
  const sessionsInRange = useMemo(() => {
    if (!sessions) return [];
    if (dateRange === "all") return sessions;
    const days = parseInt(dateRange, 10);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => {
      const t = new Date(s.session_date).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [sessions, dateRange]);

  // Selected sessions (default = all in range). Reset when range changes.
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectedSessions(new Set(sessionsInRange.map((s) => s.id)));
  }, [sessionsInRange]);

  // Filter shots by selected sessions (only when sessions prop provided)
  const filteredShots = useMemo(() => {
    if (!sessions) return shots;
    return shots.filter((s) => s.session_id && selectedSessions.has(s.session_id));
  }, [shots, sessions, selectedSessions]);

  const allClubs = useMemo(
    () => sortClubs(Array.from(new Set(filteredShots.map((s) => s.club_type || "Unknown")))),
    [filteredShots]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFairway, setShowFairway] = useState(false);

  const toggle = (c: string) => {
    const next = new Set(selected);
    next.has(c) ? next.delete(c) : next.add(c);
    setSelected(next);
  };

  const toggleSession = (id: string) => {
    const next = new Set(selectedSessions);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSessions(next);
  };

  // Build per-club data + ellipse
  const clubData = useMemo(() => {
    return Array.from(selected).map((club) => {
      const pts = filteredShots
        .filter((s) => (s.club_type || "Unknown") === club)
        .map((s) => ({
          side: (s.side_carry ?? s.side_total ?? 0) as number,
          carry: (s.carry ?? s.total ?? 0) as number,
        }))
        .filter((p) => Number.isFinite(p.side) && Number.isFinite(p.carry) && p.carry > 0);
      const ellipse = fitEllipse(pts, 2);
      return { club, color: clubColor(club), pts, ellipse };
    });
  }, [selected, filteredShots]);

  // Chart bounds — locked to 1:1 physical aspect so lateral dispersion is
  // shown to true scale (matches fairway/tour-average realism instead of
  // being visually stretched by the container width).
  // CHART_ASPECT must match ResponsiveContainer's aspect prop below.
  const CHART_ASPECT = isMobileChart ? 0.72 : 1.6; // width / height
  const bounds = useMemo(() => {
    const all = clubData.flatMap((c) => c.pts);
    if (all.length === 0) return { xMin: -20, xMax: 20, yMin: 0, yMax: 100 };
    const sides = all.map((p) => p.side);
    const carries = all.map((p) => p.carry);
    const pad = 10;
    const yMin = Math.max(0, Math.min(...carries) - pad);
    const yMax = Math.max(...carries) + pad;
    const yRange = yMax - yMin;
    // Ensure X spans at least what's needed for the data, but always at least
    // yRange * aspect so 1 side-unit == 1 carry-unit on screen.
    const dataSpread = Math.max(Math.abs(Math.min(...sides) - pad), Math.abs(Math.max(...sides) + pad));
    const spread = Math.max(dataSpread, (yRange * CHART_ASPECT) / 2);
    return { xMin: -spread, xMax: spread, yMin, yMax };
  }, [clubData]);

  const DATE_RANGES: { value: DateRange; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "30", label: "Last 30 days" },
    { value: "60", label: "Last 60 days" },
    { value: "90", label: "Last 3 months" },
    { value: "180", label: "Last 6 months" },
    { value: "365", label: "Last 12 months" },
  ];
  const activeRangeLabel = DATE_RANGES.find((r) => r.value === dateRange)?.label ?? "All time";
  const allSelected = sessionsInRange.length > 0 && selectedSessions.size === sessionsInRange.length;
  const sessionsLabel =
    !sessions || sessionsInRange.length === 0
      ? "Sessions"
      : allSelected
      ? `All sessions (${sessionsInRange.length})`
      : `${selectedSessions.size} / ${sessionsInRange.length}`;

  return (
    <Card>
      <CardHeader className="space-y-2">
        {sessions && sessions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Sessions multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-medium">
                  <span className="truncate max-w-[160px]">{sessionsLabel}</span>
                  <ChevronDown className="h-3 w-3 text-accent" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-auto min-w-[200px]">
                <div className="flex gap-2 px-2 py-1.5 border-b border-border/60">
                  <button
                    onClick={() => setSelectedSessions(new Set(sessionsInRange.map((s) => s.id)))}
                    className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted"
                  >All</button>
                  <button
                    onClick={() => setSelectedSessions(new Set())}
                    className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted"
                  >None</button>
                </div>
                {sessionsInRange.map((s) => {
                  const on = selectedSessions.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSession(s.id)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm hover:bg-muted text-left"
                    >
                      <span
                        className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                          on ? "bg-accent border-accent text-accent-foreground" : "border-border bg-background"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="tabular-nums">{format(parseISO(s.session_date), "dd/MM")}</span>
                    </button>
                  );
                })}
                {sessionsInRange.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No sessions in range</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Date range filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-medium">
                  <span>{activeRangeLabel}</span>
                  <ChevronDown className="h-3 w-3 text-accent" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[160px]">
                {DATE_RANGES.map((r) => (
                  <DropdownMenuItem
                    key={r.value}
                    onSelect={() => setDateRange(r.value)}
                    className={`text-sm cursor-pointer ${dateRange === r.value ? "text-accent bg-accent/10" : ""}`}
                  >
                    {r.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Shot dispersion ({dLbl})</CardTitle>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setShowFairway((v) => !v)}
              className={`px-2 py-1 rounded border transition ${
                showFairway
                  ? "bg-green-600/20 border-green-600 text-green-700 dark:text-green-400"
                  : "border-border hover:bg-muted"
              }`}
            >{showFairway ? "Hide fairway" : "Show fairway"}</button>
            <button
              onClick={() => setSelected(new Set(allClubs))}
              className="px-2 py-1 rounded border border-border hover:bg-muted"
            >Select all</button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1 rounded border border-border hover:bg-muted"
            >Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allClubs.map((c) => {
            const on = selected.has(c);
            const color = clubColor(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                className="text-xs px-2 py-1 rounded-full border transition"
                style={{
                  borderColor: color,
                  backgroundColor: on ? color : "transparent",
                  color: on ? "white" : color,
                }}
              >{c}</button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" aspect={CHART_ASPECT}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid opacity={0.15} />
            <XAxis
              type="number" dataKey="side"
              domain={[bounds.xMin, bounds.xMax]}
              hide
            />
            <YAxis
              type="number" dataKey="carry"
              domain={[bounds.yMin, bounds.yMax]}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              width={44}
              label={{ value: `Carry (${dLbl})`, angle: -90, position: "insideLeft", style: { textAnchor: "middle" } }}
            />
            <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(v: number) => Math.round(v)}
            />

            {/* Ellipses drawn via SVG using axis scales */}
            <Customized component={(props: any) => {
              const { xAxisMap, yAxisMap } = props;
              const xAxis = xAxisMap && Object.values(xAxisMap)[0] as any;
              const yAxis = yAxisMap && Object.values(yAxisMap)[0] as any;
              if (!xAxis || !yAxis) return null;
              const xScale = xAxis.scale;
              const yScale = yAxis.scale;
              const xUnit = Math.abs(xScale(1) - xScale(0));
              const yUnit = Math.abs(yScale(1) - yScale(0));
              // Average fairway width ~ 40 yards (~37 m) at landing zone
              const fairwayHalfWidth = dLbl === "m" ? 18 : 20;
              return (
                <g>
                  {showFairway && (() => {
                    const x0 = xScale(-fairwayHalfWidth);
                    const x1 = xScale(fairwayHalfWidth);
                    const yTop = yScale(bounds.yMax);
                    const yBot = yScale(bounds.yMin);
                    return (
                      <rect
                        x={Math.min(x0, x1)}
                        y={Math.min(yTop, yBot)}
                        width={Math.abs(x1 - x0)}
                        height={Math.abs(yBot - yTop)}
                        fill="#4ade80"
                        fillOpacity={0.18}
                        stroke="#22c55e"
                        strokeOpacity={0.4}
                        strokeWidth={1}
                        strokeDasharray="6 4"
                      />
                    );
                  })()}
                  {clubData.map(({ club, color, ellipse }) => {
                    if (!ellipse) return null;
                    const cx = xScale(ellipse.cx);
                    const cy = yScale(ellipse.cy);
                    // Convert world semi-axes to pixel space via scale slope
                    const rxPx = ellipse.rx * xUnit;
                    const ryPx = ellipse.ry * yUnit;
                    const angleDeg = (ellipse.angleRad * 180) / Math.PI;
                    return (
                      <g key={club} transform={`translate(${cx} ${cy}) rotate(${-angleDeg})`}>
                        <ellipse
                          cx={0} cy={0} rx={rxPx} ry={ryPx}
                          fill={color} fillOpacity={0.12}
                          stroke={color} strokeOpacity={0.6} strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                        <circle cx={0} cy={0} r={3} fill={color} />
                      </g>
                    );
                  })}
                </g>
              );
            }} />
            {clubData.map(({ club, color, pts }) => (
              <Scatter key={club} name={club} data={pts} fill={color} />
            ))}
            <Legend />
          </ScatterChart>
        </ResponsiveContainer>

        {/* Shape summary per selected club */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
          {clubData.map(({ club, color, ellipse, pts }) => (
            <div key={club} className="border border-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="font-medium">{club}</span>
                <span className="text-xs text-muted-foreground ml-auto">{pts.length} shots</span>
              </div>
              {ellipse ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    Pattern: <span className="text-foreground font-medium">{ellipse.shape}</span>
                    {" "}({ellipse.shapePct.toFixed(0)}%)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Landing zone: {(ellipse.rx * 2).toFixed(0)} × {(ellipse.ry * 2).toFixed(0)} {dLbl} (95%)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Centre: {ellipse.cx.toFixed(0)} side / {ellipse.cy.toFixed(0)} carry
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">Need at least 3 shots for a pattern.</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionTrendChart({
  sessions, shots, dLbl, sLbl,
}: { sessions: Session[]; shots: Shot[]; dLbl: string; sLbl: string }) {
  const data = sessions.map((s) => {
    const ss = shots.filter((x) => x.session_id === s.id);
    return {
      label: format(parseISO(s.session_date), "d/M"),
      carry: mean(ss.map((x) => x.carry)) ?? 0,
      ball: mean(ss.map((x) => x.ball_speed)) ?? 0,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="label" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="carry" stroke="#1C1F24" name={`Avg carry (${dLbl})`} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ball" stroke="#5F6F52" name={`Avg ball spd (${sLbl})`} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SessionDetail({
  session, shots, dLbl, sLbl,
}: { session: Session; shots: Shot[]; dLbl: string; sLbl: string }) {
  const stats = useMemo(() => statsByClub(shots), [shots]);
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {format(parseISO(session.session_date), "EEE d MMM yyyy")}
        {session.started_at ? ` · ${format(parseISO(session.started_at), "h:mma").toLowerCase()}` : ""}
        {session.duration_minutes ? ` · ${Math.round(session.duration_minutes)} min` : ""}
        {" · "}{session.shot_count} shots
      </div>

      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="dispersion">Dispersion</TabsTrigger>
          <TabsTrigger value="shots">Every shot</TabsTrigger>
        </TabsList>
        <TabsContent value="stats" className="pt-4">
          <ClubStatsTable rows={stats} dLbl={dLbl} sLbl={sLbl} />
        </TabsContent>
        <TabsContent value="dispersion" className="pt-4">
          <DispersionChart shots={shots} dLbl={dLbl} />
        </TabsContent>
        <TabsContent value="shots" className="pt-4">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="text-right">Ball ({sLbl})</TableHead>
                    <TableHead className="text-right">Club ({sLbl})</TableHead>
                    <TableHead className="text-right">Smash</TableHead>
                    <TableHead className="text-right">Launch°</TableHead>
                    <TableHead className="text-right">Spin</TableHead>
                    <TableHead className="text-right">Carry ({dLbl})</TableHead>
                    <TableHead className="text-right">Total ({dLbl})</TableHead>
                    <TableHead className="text-right">Side ({dLbl})</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shots.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.shot_number ?? ""}</TableCell>
                      <TableCell style={{ color: clubColor(s.club_type || "") }}>{s.club_type ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmt(s.ball_speed, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.club_speed, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.smash_factor, 2)}</TableCell>
                      <TableCell className="text-right">{fmt(s.launch_angle, 1)}</TableCell>
                      <TableCell className="text-right">{fmt(s.spin_rate, 0)}</TableCell>

                      <TableCell className="text-right">{fmt(s.carry, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.total, 0)}</TableCell>
                      <TableCell className="text-right">{fmt(s.side_carry ?? s.side_total, 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Optimise tab — compare a player's per-club numbers to PGA Tour
// averages (Trackman). Colored red/orange/green based on % gap.
// ============================================================
function OptimiseTab({
  clubStats,
  swingStats,
  activeDist,
  activeSpd,
}: {
  clubStats: ReturnType<typeof import("@/lib/range-stats").statsByClub>;
  swingStats: ReturnType<typeof import("@/lib/range-stats").swingStatsByClub>;
  activeDist: DistanceUnit;
  activeSpd: SpeedUnit;
}) {
  const [benchmark, setBenchmark] = useState<BenchmarkSet>("tour");

  // Only clubs where we have BOTH shot data and a benchmark match.
  const options = useMemo(() => {
    return clubStats
      .map((c) => ({ club: c.club, tour: matchBenchmarkClub(c.club, benchmark) }))
      .filter((x) => x.tour !== null) as { club: string; tour: TourAverage }[];
  }, [clubStats, benchmark]);

  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && options.length) setSelected(options[0].club);
  }, [options, selected]);

  if (options.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Hit a few shots with recognised clubs (Driver, 7 Iron, PW, etc.) and we'll benchmark you against the {BENCHMARK_LABELS[benchmark]}.
        </CardContent>
      </Card>
    );
  }

  const stats = clubStats.find((c) => c.club === selected);
  const swing = swingStats.find((c) => c.club === selected);
  const tour = matchBenchmarkClub(selected ?? "", benchmark) ?? null;
  // Always keep the PGA Tour row as the "optimal target" so direction-aware
  // metrics (launch, spin, AoA) can tell which side of the amateur is better.
  const optimal = matchBenchmarkClub(selected ?? "", "tour") ?? null;

  // Convert tour values (which are yards / mph) into the user's active units.
  const tourInUserUnits = useMemo(() => {
    if (!tour) return null;
    return {
      clubSpeed: convertSpeedNumber(tour.clubSpeedMph, "mph", activeSpd),
      ballSpeed: convertSpeedNumber(tour.ballSpeedMph, "mph", activeSpd),
      smash: tour.smashFactor,
      launch: tour.launchAngleDeg,
      spin: tour.spinRpm,
      carry: convertDistanceNumber(tour.carryYd, "yd", activeDist),
      aoa: tour.aoaDeg,
    };
  }, [tour, activeDist, activeSpd]);

  const optimalInUserUnits = useMemo(() => {
    if (!optimal) return null;
    return {
      clubSpeed: convertSpeedNumber(optimal.clubSpeedMph, "mph", activeSpd),
      ballSpeed: convertSpeedNumber(optimal.ballSpeedMph, "mph", activeSpd),
      smash: optimal.smashFactor,
      launch: optimal.launchAngleDeg,
      spin: optimal.spinRpm,
      carry: convertDistanceNumber(optimal.carryYd, "yd", activeDist),
      aoa: optimal.aoaDeg,
    };
  }, [optimal, activeDist, activeSpd]);

  if (!stats || !tour || !tourInUserUnits || !optimalInUserUnits) return null;

  // "higher"      = bigger number is unambiguously better (speed, carry, smash).
  // "toward_tour" = the tour value is the target; being closer to it (from
  //                 either side) is better. Handles launch angle (amateurs
  //                 launch driver too high with too much spin, pros lower and
  //                 flatter; irons the opposite), spin rate (drivers want less,
  //                 wedges want more), and AoA (up on driver, down on irons).
  type Direction = "higher" | "toward_tour";

  type Row = {
    key: keyof typeof METRIC_TOOLTIPS;
    label: string;
    you: number | null;
    tour: number;          // value shown in the "them" column (the active benchmark)
    optimal: number;       // always the PGA tour value — the north star for direction
    unit: string;
    digits: number;
    direction: Direction;
  };

  const rows: Row[] = [
    { key: "clubSpeed",   label: "Club speed",      you: stats.avgClubSpeed,    tour: tourInUserUnits.clubSpeed, optimal: optimalInUserUnits.clubSpeed, unit: activeSpd,  digits: 1, direction: "higher" },
    { key: "ballSpeed",   label: "Ball speed",      you: stats.avgBallSpeed,    tour: tourInUserUnits.ballSpeed, optimal: optimalInUserUnits.ballSpeed, unit: activeSpd,  digits: 1, direction: "higher" },
    // Smash is a per-shot ratio — average it per-club from the shot column
    // (filtered to physically-valid values in statsByClub) rather than
    // deriving it from aggregated ball/club speeds, which is only correct
    // when computed per club, never across the bag.
    { key: "smashFactor", label: "Smash factor",    you: stats.avgSmash,        tour: tourInUserUnits.smash,     optimal: optimalInUserUnits.smash,     unit: "",         digits: 2, direction: "higher" },
    { key: "launchAngle", label: "Launch angle",    you: stats.avgLaunch,       tour: tourInUserUnits.launch,    optimal: optimalInUserUnits.launch,    unit: "°",        digits: 1, direction: "toward_tour" },
    { key: "spin",        label: "Spin rate",       you: stats.avgSpin,         tour: tourInUserUnits.spin,      optimal: optimalInUserUnits.spin,      unit: "rpm",      digits: 0, direction: "toward_tour" },
    { key: "carry",       label: "Carry",           you: stats.avgCarry,        tour: tourInUserUnits.carry,     optimal: optimalInUserUnits.carry,     unit: activeDist, digits: 1, direction: "higher" },
    { key: "aoa",         label: "Angle of attack", you: swing?.avgAoA ?? null, tour: tourInUserUnits.aoa,       optimal: optimalInUserUnits.aoa,       unit: "°",        digits: 1, direction: "toward_tour" },
  ];

  const benchmarkLabel = BENCHMARK_LABELS[benchmark];
  const youColHeader = "You";
  const themColHeader = benchmark === "tour" ? "Tour" : "Avg";

  return (
    <TooltipProvider delayDuration={100}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Compare to {benchmarkLabel}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <ToggleGroup
                type="single"
                size="sm"
                value={benchmark}
                onValueChange={(v) => v && setBenchmark(v as BenchmarkSet)}
                className="border rounded-md"
              >
                <ToggleGroupItem value="tour" className="text-xs px-2.5 h-8">PGA Tour</ToggleGroupItem>
                <ToggleGroupItem value="amateur" className="text-xs px-2.5 h-8">Avg Golfer</ToggleGroupItem>
              </ToggleGroup>
              <Select value={selected ?? ""} onValueChange={setSelected}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select club" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.club} value={o.club}>{o.club}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            {benchmark === "tour"
              ? "PGA Tour averages from Trackman. Green = tour-level, orange = close, red = big gap."
              : "Average amateur (~14 hcp) from Trackman. Green = trending toward tour, orange = around average, red = further from tour than the average golfer."}
          </p>
          {benchmark === "amateur" && (
            <p className="text-[11px] text-muted-foreground/80 pt-1 leading-relaxed">
              Higher is better for club speed, ball speed, smash and carry. For launch, spin and angle of attack, closer to the tour number is better (amateurs spin the driver too much and don't hit down enough on irons).
            </p>
          )}
        </CardHeader>
        <CardContent className="min-w-0 p-0 sm:p-2">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-sm px-3 sm:px-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground py-2">Metric</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">{youColHeader}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">{themColHeader}</div>
            {rows.map((r) => {
              const cls = colorClass(r.you, r.tour, r.optimal, r.direction, benchmark);
              return (
                <MetricRow
                  key={r.key as string}
                  label={r.label}
                  tip={METRIC_TOOLTIPS[r.key]}
                  you={r.you}
                  tour={r.tour}
                  unit={r.unit}
                  digits={r.digits}
                  cls={cls}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function MetricRow({
  label, tip, you, tour, unit, digits, cls,
}: {
  label: string;
  tip: string;
  you: number | null;
  tour: number;
  unit: string;
  digits: number;
  cls: string;
}) {
  const formatVal = (v: number | null) =>
    v == null || !Number.isFinite(v)
      ? "—"
      : `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits === 0 ? 0 : Math.min(digits, 1) })}${unit ? (unit === "°" || unit === "" ? unit : ` ${unit}`) : ""}`;
  return (
    <>
      <div className="py-2 border-t border-border/60 flex items-center gap-1.5">
        <span>{label}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground active:text-accent p-1 -m-1" aria-label={`About ${label}`}>
              <InfoIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="max-w-[260px] text-xs leading-relaxed">{tip}</PopoverContent>
        </Popover>

      </div>
      <div className={`py-2 border-t border-border/60 text-right font-medium ${cls}`}>
        {formatVal(you)}
      </div>
      <div className="py-2 border-t border-border/60 text-right text-muted-foreground">
        {formatVal(tour)}
      </div>
    </>
  );
}

// Direction-aware coloring:
// - "higher": bigger is better. Green if you meet/exceed benchmark, orange if
//   within 10% below, red beyond that. Vs tour we tighten to 5% / 15% so the
//   bar is higher when comparing to pros.
// - "toward_tour": the tour value is the target regardless of which benchmark
//   is displayed. Green if you're at least as close to tour as the amateur is
//   (i.e. trending in the right direction). Orange if within the amateur gap
//   plus a small tolerance. Red if further from tour than the average golfer.
function colorClass(
  you: number | null,
  benchmarkVal: number,
  optimalVal: number,
  direction: "higher" | "toward_tour",
  benchmark: "tour" | "amateur"
): string {
  if (you == null || !Number.isFinite(you) || benchmarkVal === 0) return "text-foreground";
  const GREEN = "text-[hsl(140_60%_40%)]";
  const ORANGE = "text-[hsl(30_90%_50%)]";
  const RED = "text-destructive";

  if (direction === "higher") {
    const pct = (you - benchmarkVal) / Math.abs(benchmarkVal);
    if (benchmark === "tour") {
      if (pct >= -0.05) return GREEN;
      if (pct >= -0.15) return ORANGE;
      return RED;
    }
    // vs amateur — matching the average is expected, exceeding it is green.
    if (pct >= 0) return GREEN;
    if (pct >= -0.10) return ORANGE;
    return RED;
  }

  // toward_tour: measure gap to the tour optimal, not the displayed benchmark.
  const yourGap = Math.abs(you - optimalVal);
  const scale = Math.abs(optimalVal) || 1;
  if (benchmark === "tour") {
    const rel = yourGap / scale;
    if (rel <= 0.08) return GREEN;
    if (rel <= 0.20) return ORANGE;
    return RED;
  }
  // vs amateur: green if you're closer to tour than the amateur is.
  const amateurGap = Math.abs(benchmarkVal - optimalVal) || scale * 0.05;
  const ratio = yourGap / amateurGap; // <1 means closer to tour than avg golfer
  if (ratio <= 1) return GREEN;
  if (ratio <= 1.5) return ORANGE;
  return RED;
}

// Local unit converters used only by OptimiseTab (avoids re-importing).
function convertSpeedNumber(v: number, from: SpeedUnit, to: SpeedUnit): number {
  if (from === to) return v;
  return from === "mph" ? v * 1.60934 : v * 0.621371;
}
function convertDistanceNumber(v: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return v;
  return from === "yd" ? v * 0.9144 : v * 1.09361;
}
