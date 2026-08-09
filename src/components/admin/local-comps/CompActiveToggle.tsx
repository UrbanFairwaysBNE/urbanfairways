import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocalCompSettings, DAY_NAMES, formatTimeLabel } from "@/hooks/useLocalCompSettings";

const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let h = 5; h <= 23; h++) {
    out.push(`${String(h).padStart(2, "0")}:00:00`);
    if (h < 23) out.push(`${String(h).padStart(2, "0")}:30:00`);
  }
  return out;
})();

const DURATIONS = [1, 1.5, 2, 2.5, 3];

export function CompActiveToggle() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useLocalCompSettings();

  const [day, setDay] = useState<string>("3");
  const [start, setStart] = useState<string>("17:00:00");
  const [end, setEnd] = useState<string>("20:00:00");
  const [duration, setDuration] = useState<string>("2");

  useEffect(() => {
    if (!settings) return;
    setDay(String(settings.comp_day));
    setStart(settings.comp_start_time);
    setEnd(settings.comp_end_time);
    setDuration(String(settings.comp_duration_hours));
  }, [settings]);

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!settings?.id) throw new Error("Settings row missing");
      const { error } = await supabase
        .from("local_comp_settings")
        .update(patch)
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-settings"] });
      toast({ title: "Saved", duration: 2000 });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const enabled = !!settings?.comp_enabled;

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <div>
              <Label htmlFor="comp-active-toggle" className="text-base font-semibold cursor-pointer">
                Weekly Comp Active
              </Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                When off, the comp prompt is removed from the booking flow and the Weekly Comp
                section is locked for customers.
              </p>
            </div>
          </div>
          <Switch
            id="comp-active-toggle"
            checked={enabled}
            onCheckedChange={(v) => save.mutate({ comp_enabled: v })}
            disabled={save.isPending || !settings}
          />
        </div>

        {enabled && (
          <div className="grid gap-3 sm:grid-cols-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs">Comp day</Label>
              <Select value={day} onValueChange={(v) => { setDay(v); save.mutate({ comp_day: Number(v) }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {DAY_NAMES.map((d, i) => (
                    <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">First tee-off</Label>
              <Select value={start} onValueChange={(v) => { setStart(v); save.mutate({ comp_start_time: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50 max-h-60">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Last tee-off</Label>
              <Select value={end} onValueChange={(v) => { setEnd(v); save.mutate({ comp_end_time: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50 max-h-60">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{formatTimeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Session length</Label>
              <Select value={duration} onValueChange={(v) => { setDuration(v); save.mutate({ comp_duration_hours: Number(v) }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "hour" : "hours"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {enabled && (
          <p className="text-xs text-muted-foreground">
            Comp bookings: {DAY_NAMES[Number(day)]}s, tee off {formatTimeLabel(start)}–{formatTimeLabel(end)},
            {" "}{duration} hour sessions.
          </p>
        )}
        {!enabled && settings && (
          <Button variant="outline" size="sm" onClick={() => save.mutate({ comp_enabled: true })} disabled={save.isPending}>
            Enable weekly comp
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
