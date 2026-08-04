import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Row {
  id: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${h.toString().padStart(2, "0")}:${m}`;
});

function formatTime(time: string): string {
  const [hh, mm] = time.split(":");
  const hour = parseInt(hh, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${suffix}`;
}

interface Props {
  table: "operating_hours" | "staffed_hours";
  toggleField: "is_open" | "is_staffed";
  startField: "open_time" | "start_time";
  endField: "close_time" | "end_time";
  toggleLabel: string;
  closedLabel: string;
  helperText: string;
}

export function DailyHoursEditor({
  table,
  toggleField,
  startField,
  endField,
  toggleLabel,
  closedLabel,
  helperText,
}: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const { data } = await (supabase as any)
        .from(table)
        .select("*")
        .order("day_of_week");
      if (data) {
        setRows(
          data.map((r: any) => ({
            id: r.id,
            day_of_week: r.day_of_week,
            is_open: r[toggleField],
            open_time: (r[startField] || "09:00").substring(0, 5),
            close_time: (r[endField] || "17:00").substring(0, 5),
          }))
        );
      }
      setIsLoading(false);
    };
    load();
  }, [table, toggleField, startField, endField]);

  const update = async (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const dbPatch: any = {};
    if ("is_open" in patch) dbPatch[toggleField] = patch.is_open;
    if ("open_time" in patch) dbPatch[startField] = patch.open_time;
    if ("close_time" in patch) dbPatch[endField] = patch.close_time;
    const { error } = await (supabase as any).from(table).update(dbPatch).eq("id", id);
    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Saved", duration: 1500 });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm text-muted-foreground mb-2">{helperText}</p>
        {rows.map((r) => (
          <div
            key={r.id}
            className={`p-3 border rounded-lg transition-colors ${
              r.is_open ? "bg-background" : "bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-[150px]">
                <Switch
                  checked={r.is_open}
                  onCheckedChange={(v) => update(r.id, { is_open: v })}
                  aria-label={`${toggleLabel} ${DAY_NAMES[r.day_of_week]}`}
                />
                <Label className="font-medium">{DAY_NAMES[r.day_of_week]}</Label>
              </div>
              {r.is_open ? (
                <div className="flex items-center gap-2 text-sm">
                  <Select
                    value={r.open_time}
                    onValueChange={(v) => update(r.id, { open_time: v })}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {formatTime(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">to</span>
                  <Select
                    value={r.close_time}
                    onValueChange={(v) => update(r.id, { close_time: v })}
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {formatTime(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{closedLabel}</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
