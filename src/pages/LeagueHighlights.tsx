import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Film, ChevronRight, MapPin } from "lucide-react";

interface SessionRow {
  id: string;
  bay_number: number;
  player_name: string | null;
  tournament_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  round_number: number | null;
  trigger_source: string | null;
  clip_count: number;
}

export default function LeagueHighlights() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      // RLS scopes recording_sessions to sessions whose booking belongs to auth.uid()
      // Explicitly scope to the current user's bookings (admins would otherwise see all via RLS)
      const { data: rows } = await supabase
        .from("recording_sessions")
        .select("id, bay_number, player_name, tournament_name, started_at, ended_at, status, round_number, trigger_source, bookings!inner(user_id)")
        .eq("bookings.user_id", user.id)
        .not("started_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(100);

      const sessionRows = (rows ?? []) as Omit<SessionRow, "clip_count">[];
      const ids = sessionRows.map((r) => r.id);

      let counts: Record<string, number> = {};
      if (ids.length) {
        const { data: clipRows } = await supabase
          .from("recording_clips")
          .select("recording_session_id")
          .in("recording_session_id", ids);
        counts = (clipRows ?? []).reduce<Record<string, number>>((acc, c) => {
          acc[c.recording_session_id] = (acc[c.recording_session_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      setSessions(sessionRows.map((r) => ({ ...r, clip_count: counts[r.id] ?? 0 })));
      setLoading(false);
    })();
  }, [user]);

  return (
    <LeagueLayout>
      <div className="mb-6 animate-fade-in">
        <h1 className="font-anton text-2xl md:text-3xl text-primary mb-1">YOUR HIGHLIGHTS</h1>
        <p className="font-inter text-muted-foreground text-sm">
          Recorded sessions from your bookings. Open a session to view and download your clips.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 text-brand-accent animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Film className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-inter text-muted-foreground">
              No recorded sessions yet. Highlights are captured automatically during your League rounds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const started = s.started_at ? new Date(s.started_at) : null;
            return (
              <Link
                key={s.id}
                to={`/league/highlights/${s.id}`}
                className="block bg-white rounded-2xl border border-border/50 p-4 shadow-sm hover:border-brand-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-inter font-semibold text-primary text-base leading-tight mb-2 truncate">
                      {s.tournament_name || "Practice Session"}
                      {s.trigger_source !== "local_comp" && s.round_number ? ` — Round ${s.round_number}` : ""}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge variant="outline">Bay {s.bay_number}</Badge>
                      {s.trigger_source === "local_comp" && (
                        <Badge variant="outline" className="border-brand-accent/40 text-brand-accent">Local Comp</Badge>
                      )}
                      <Badge className="bg-brand-accent/10 text-brand-accent border-brand-accent/30">
                        {s.clip_count} clip{s.clip_count === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-inter">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span>
                        {started
                          ? started.toLocaleString("en-AU", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/league">← Back to League</Link>
        </Button>
      </div>
    </LeagueLayout>
  );
}
