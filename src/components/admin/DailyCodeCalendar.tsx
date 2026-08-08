import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, RefreshCw } from "lucide-react";

interface DayRow {
  id: string;
  code: string;
  status: string;
  valid_from: string;
  valid_until: string;
  label: string | null;
}

/** YYYY-MM-DD of a door-day rendered as a friendly Brisbane date. */
function dayLabel(day: string) {
  return new Date(`${day}T12:00:00+10:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  });
}

function dayKey(validFrom: string) {
  return new Date(new Date(validFrom).getTime() + 10 * 3600 * 1000 - 4 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function DailyCodeCalendar({ appendHash }: { appendHash: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [today, setToday] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "daily_calendar", days: 120 },
    });
    setRows(((data as any)?.days || []) as DayRow[]);
    setToday((data as any)?.today || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const backfill = async () => {
    setBusy("backfill");
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "daily_backfill" },
    });
    setBusy(null);
    if (error || !(data as any)?.success) {
      toast({
        title: "Could not build the calendar",
        description: error?.message || (data as any)?.error || "Unknown error",
        variant: "destructive",
        duration: 6000,
      });
    } else {
      toast({
        title: `Calendar ready to ${(data as any).to}`,
        description: `${(data as any).created} new code${(data as any).created === 1 ? "" : "s"} generated.`,
        duration: 5000,
      });
    }
    load();
  };

  const regenerate = async (day: string) => {
    setBusy(day);
    const { data, error } = await supabase.functions.invoke("door-code-manager", {
      body: { action: "daily_regenerate", day },
    });
    setBusy(null);
    if (error || !(data as any)?.success) {
      toast({
        title: "Could not regenerate",
        description: error?.message || (data as any)?.error || "Unknown error",
        variant: "destructive",
        duration: 6000,
      });
    } else {
      toast({ title: `${dayLabel(day)} is now ${(data as any).code}`, duration: 5000 });
    }
    load();
  };

  if (loading) return <Skeleton className="h-40" />;

  const visible = showAll ? rows : rows.slice(0, 14);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4" />
          Upcoming daily codes
        </div>
        <Button variant="outline" size="sm" onClick={backfill} disabled={busy === "backfill"}>
          <RefreshCw className={`h-4 w-4 mr-2 ${busy === "backfill" ? "animate-spin" : ""}`} />
          Top up 4 months
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Codes are generated about four months ahead so bookings made well in advance can be emailed
        the code for their own date. Only the current day's code is ever loaded onto the keypad —
        the rest sit here until their day arrives.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No codes scheduled yet — use “Top up 4 months” to build the calendar.
        </p>
      ) : (
        <>
          <div className="divide-y rounded-md border">
            {visible.map((r) => {
              const day = dayKey(r.valid_from);
              const isToday = day === today;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">
                      {dayLabel(day)}
                      {isToday && <span className="text-muted-foreground"> · today</span>}
                    </p>
                    <p className="font-mono text-base tracking-widest">
                      {r.code}
                      {appendHash ? "#" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={r.status === "active" ? "default" : "secondary"}>
                      {r.status === "scheduled" ? "upcoming" : r.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerate(day)}
                      disabled={busy === day}
                    >
                      <RefreshCw className={`h-4 w-4 ${busy === day ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {rows.length > 14 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show next 14 days" : `Show all ${rows.length} days`}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Regenerating a day replaces its code. Anyone already emailed that day's code would need
            resending, so only do it if a code has been shared too widely.
          </p>
        </>
      )}
    </div>
  );
}
