import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StaffedHour {
  day_of_week: number;
  is_staffed: boolean;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

const DAY_SHORT = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatHourLabel(time: string): string {
  const [hh, mm] = time.split(":");
  const hour = parseInt(hh, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return mm && mm !== "00" ? `${h12}:${mm}${suffix}` : `${h12}${suffix}`;
}

/** Group consecutive days sharing the same window into rows like "Mon – Thu". */
export function groupDayRanges(
  rows: { day_of_week: number; start_time: string; end_time: string }[]
): { day: string; time: string }[] {
  // Order Monday-first so ranges read naturally
  const ordered = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => rows.find((r) => r.day_of_week === d))
    .filter(Boolean) as typeof rows;

  const out: { day: string; time: string }[] = [];
  let i = 0;
  while (i < ordered.length) {
    const start = ordered[i];
    let end = start;
    let j = i + 1;
    while (
      j < ordered.length &&
      ordered[j].start_time === start.start_time &&
      ordered[j].end_time === start.end_time
    ) {
      end = ordered[j];
      j++;
    }
    const label =
      start === end
        ? DAY_SHORT[start.day_of_week]
        : `${DAY_SHORT[start.day_of_week]} – ${DAY_SHORT[end.day_of_week]}`;
    out.push({
      day: label,
      time: `${formatHourLabel(start.start_time)} – ${formatHourLabel(start.end_time)}`,
    });
    i = j;
  }
  return out;
}

export function useStaffedHours() {
  const [hours, setHours] = useState<StaffedHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("staffed_hours")
      .select("day_of_week,is_staffed,start_time,end_time")
      .order("day_of_week")
      .then(({ data }) => {
        if (!mounted) return;
        setHours(
          (data ?? []).map((h: any) => ({
            day_of_week: h.day_of_week,
            is_staffed: h.is_staffed,
            start_time: (h.start_time || "09:00").substring(0, 5),
            end_time: (h.end_time || "17:00").substring(0, 5),
          }))
        );
        setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const staffedDays = hours.filter((h) => h.is_staffed);
  const hasStaffedHours = staffedDays.length > 0;
  const staffedRanges = groupDayRanges(staffedDays);

  return { hours, isLoading, hasStaffedHours, staffedRanges };
}
