import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OperatingHour {
  day_of_week: number;
  is_open: boolean;
  open_time: string; // HH:MM
  close_time: string; // HH:MM
}

const FALLBACK: OperatingHour[] = Array.from({ length: 7 }, (_, d) => ({
  day_of_week: d,
  is_open: true,
  open_time: "05:00",
  close_time: "23:00",
}));

export function useOperatingHours() {
  const [hours, setHours] = useState<OperatingHour[]>(FALLBACK);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("operating_hours")
      .select("day_of_week,is_open,open_time,close_time")
      .order("day_of_week")
      .then(({ data }) => {
        if (!mounted) return;
        if (data && data.length) {
          setHours(
            data.map((h: any) => ({
              day_of_week: h.day_of_week,
              is_open: h.is_open,
              open_time: (h.open_time || "05:00").substring(0, 5),
              close_time: (h.close_time || "23:00").substring(0, 5),
            }))
          );
        }
        setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Global window across all days — earliest open time to latest close time.
   * Used for time slot generation so the timetable/picker always covers
   * every possible bookable time in the week. Minute-accurate (e.g. 5:30am).
   */
  const globalWindow = (() => {
    const open = hours.filter((h) => h.is_open);
    if (!open.length)
      return { startHour: 5, endHour: 23, startMinutes: 5 * 60, endMinutes: 23 * 60 };
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const startMinutes = Math.min(...open.map((h) => toMin(h.open_time)));
    const endMinutes = Math.max(...open.map((h) => toMin(h.close_time)));
    return {
      startHour: Math.floor(startMinutes / 60),
      endHour: Math.ceil(endMinutes / 60),
      startMinutes,
      endMinutes,
    };
  })();


  const getForDate = (date: Date): OperatingHour => {
    const d = date.getDay();
    return hours.find((h) => h.day_of_week === d) ?? FALLBACK[d];
  };

  return { hours, isLoading, globalWindow, getForDate };
}
