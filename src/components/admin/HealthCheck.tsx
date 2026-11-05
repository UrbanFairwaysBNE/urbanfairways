import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBrisbane } from "@/lib/brisbane-time";
import { controllerPresence } from "@/lib/controller-presence";
import {
  Light, Metrics, Verdict, bayVerdict, bookingsVerdict, doorVerdict, emailsVerdict,
  membershipsVerdict, packsVerdict, paymentsVerdict, worst,
} from "@/lib/health-check";

type Row = { day: string; category: string; subject: string; metric: string; value: number };
const DAYS = 7;

function brisbaneDays(count: number): string[] {
  const today = new Date(Date.now() + 10 * 3600 * 1000); // Brisbane is UTC+10, no DST
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

const dayLabel = (iso: string, i: number) =>
  i === 0 ? "Today" : new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" });

const lightClass: Record<Light, string> = {
  green: "bg-status-ok",
  amber: "bg-status-warn",
  red: "bg-destructive",
  none: "bg-muted-foreground/20",
};

function Dot({ v, title, day }: { v: Verdict; title: string; day: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`${title} ${day}: ${v.light}`}
          className={cn("h-5 w-5 rounded-full mx-auto block", lightClass[v.light])}
        />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <p className="font-semibold mb-1">{title} · {day}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          {v.notes.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function HealthCheck() {
  const [devices, setDevices] = useState<{ bay_id: string; last_seen: string | null; app_version: string | null }[]>([]);
  const [bays, setBays] = useState<{ id: string; name: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const days = useMemo(() => brisbaneDays(DAYS), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data, error }, deviceResult, bayResult] = await Promise.all([
      supabase.rpc("platform_health" as never, { _days: DAYS } as never),
      supabase.from('bay_devices').select('bay_id,last_seen,app_version'),
      supabase.from('bays').select('id,name').order('name'),
    ]);
    setPresenceError(deviceResult.error || bayResult.error ? 'Current controller status could not be checked.' : null);
    setDevices(deviceResult.data || []);
    setBays(bayResult.data || []);
    setNow(Date.now());
    if (error) setError(error.message);
    else setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Update age labels locally. Realtime reuses existing device updates; no controller ping is added.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    const channel = supabase.channel('health-check-controller-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bay_devices' }, payload => {
        const device = payload.new as { bay_id?: string; last_seen: string | null; app_version: string | null };
        if (!device.bay_id) return;
        const bayId = device.bay_id;
        setDevices(previous => [...previous.filter(d => d.bay_id !== bayId), { ...device, bay_id: bayId }]);
      }).subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, []);

  const metrics = useMemo(() => {
    const map = new Map<string, Metrics>();
    for (const r of rows ?? []) {
      const key = `${r.category}|${r.subject}|${r.day}`;
      const m = map.get(key) ?? {};
      m[r.metric] = (m[r.metric] ?? 0) + Number(r.value);
      map.set(key, m);
    }
    return (cat: string, subj: string, day: string) => map.get(`${cat}|${subj}|${day}`) ?? {};
  }, [rows]);

  const today = days[0];
  const sections: { title: string; rows: { label: string; cells: Verdict[] }[] }[] = [
    {
      title: "Bay Controllers",
      rows: Array.from({ length: 7 }, (_, i) => `Bay ${i + 1}`).map((b) => ({
        label: b,
        cells: days.map((d) => bayVerdict(metrics("bays", b, d))),
      })),
    },
    {
      title: "Platform",
      rows: [
        { label: "Bookings", cells: days.map((d) => bookingsVerdict(metrics("bookings", "all", d))) },
        { label: "Payments", cells: days.map((d) => paymentsVerdict(metrics("payments", "all", d))) },
        { label: "Booking emails", cells: days.map((d) => emailsVerdict(metrics("emails", "booking", d))) },
        { label: "Door access", cells: days.map((d) => doorVerdict(metrics("door", "all", d))) },
        {
          label: "Memberships (now)",
          cells: days.map((d) => d === today ? membershipsVerdict(metrics("memberships", "all", d)) : { light: "none", notes: ["Checked for today only"] }),
        },
        {
          label: "Prepaid packs (now)",
          cells: days.map((d) => d === today ? packsVerdict(metrics("packs", "all", d)) : { light: "none", notes: ["Checked for today only"] }),
        },
      ],
    },
  ];

  const overall = worst(sections.flatMap((s) => s.rows.map((r) => r.cells[0].light)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            Health Check
            {rows && <span className={cn("h-3 w-3 rounded-full", lightClass[overall])} />}
          </CardTitle>
          <CardDescription>Daily traffic lights for the last 7 days (Brisbane time). Tap a light for details.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="font-semibold mb-2">Controllers now</h3>
          {presenceError && <p className="text-sm text-destructive">{presenceError}</p>}
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {bays.map(bay => {
              const device = devices.find(d => d.bay_id === bay.id);
              const presence = controllerPresence(device?.last_seen || null, now);
              return <div key={bay.id} className="border-b border-border py-2 text-sm min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', presence === 'online' ? 'bg-status-ok' : 'bg-status-warn')} />
                  <span className="font-medium">{bay.name}</span>
                  <span>{presence === 'online' ? 'Online' : 'Not recently confirmed'}</span>
                  <span className="text-muted-foreground">{device?.app_version ? `v${device.app_version}` : 'Version unknown'}</span>
                </div>
                <p className="text-xs text-muted-foreground break-words">Last contact: {formatBrisbane(device?.last_seen)}</p>
              </div>;
            })}
          </div>
        </section>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!rows && !error && <Skeleton className="h-64 w-full" />}
        {rows && sections.map((s) => (
          <div key={s.title} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-semibold py-2 pr-4 text-foreground">{s.title}</th>
                  {days.map((d, i) => <th key={d} className="font-normal px-2 whitespace-nowrap">{dayLabel(d, i)}</th>)}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <td className="py-2 pr-4 whitespace-nowrap">{r.label}</td>
                    {r.cells.map((v, i) => (
                      <td key={days[i]} className="px-2 py-2"><Dot v={v} title={r.label} day={dayLabel(days[i], i)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {(["green", "amber", "red", "none"] as Light[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded-full", lightClass[l])} />
              {{ green: "Normal", amber: "Worth a look", red: "Problem", none: "No activity" }[l]}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
