import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LocalCompSettings {
  id: string;
  comp_enabled: boolean;
  /** 0 = Sunday … 6 = Saturday */
  comp_day: number;
  /** "HH:MM:SS" */
  comp_start_time: string;
  comp_end_time: string;
  comp_duration_hours: number;
  hub_highlights_enabled: boolean;
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const timeToMinutes = (t: string | undefined | null): number => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

export const formatTimeLabel = (t: string | undefined | null): string => {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "pm" : "am";
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === "00" ? `${dh}${ampm}` : `${dh}:${m}${ampm}`;
};

export function useLocalCompSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ["local-comp-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_settings")
        .select(
          "id, comp_enabled, comp_day, comp_start_time, comp_end_time, comp_duration_hours, hub_highlights_enabled"
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as LocalCompSettings | null;
    },
  });

  return {
    settings: data ?? null,
    isLoading,
    // Default to disabled until we know, so customers never see a comp prompt for a comp that's off.
    compEnabled: !!data?.comp_enabled,
  };
}
