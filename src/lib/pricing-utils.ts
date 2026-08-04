// Peak/off-peak pricing utilities.
// All rates and tier behaviour come from `pricing_config` (see src/lib/tier-config.ts).
// Nothing here hardcodes a tier key, tier name or dollar amount.

import { TierConfig, findTier, getDefaultTier } from "@/lib/tier-config";

/**
 * Determines if a given date and time is during peak hours.
 * Peak: Saturday & Sunday (all day) + Monday-Friday from 4pm.
 * Off-peak: Monday-Friday before 4pm.
 * Public holidays are treated as peak all day (pass `isPublicHoliday`).
 */
export function isPeakTime(date: Date, startTime: string, isPublicHoliday = false): boolean {
  if (isPublicHoliday) return true;

  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = parseInt(startTime.split(":")[0], 10);

  // Weekend (Saturday = 6, Sunday = 0) is always peak
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true;
  }

  // Monday-Friday: peak if 4pm (16:00) or later
  return hour >= 16;
}

/**
 * True when a time falls in the off-peak window. Tiers flagged
 * `restricted_to_off_peak` only get their member rate in this window.
 */
export function isOffPeakTime(date: Date, startTime: string, isPublicHoliday = false): boolean {
  return !isPeakTime(date, startTime, isPublicHoliday);
}

/** Add a (possibly fractional) number of hours to a HH:MM time string. */
export function addDurationToTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + Math.round(durationHours * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** A flat-price deal for a fixed session length (e.g. 90 minutes for $60). */
export interface PricingSpecial {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  applies_peak: boolean;
  applies_off_peak: boolean;
  is_active: boolean;
  display_order: number;
}

/**
 * Finds an active special that matches the session length and period, and only
 * beats the standard rate. Returns null when the normal rate is cheaper.
 */
export function findApplicableSpecial(
  specials: PricingSpecial[],
  durationHours: number,
  isPeak: boolean,
  standardTotal: number
): PricingSpecial | null {
  const minutes = Math.round(durationHours * 60);
  const matches = specials.filter(
    (s) =>
      s.is_active &&
      s.duration_minutes === minutes &&
      (isPeak ? s.applies_peak : s.applies_off_peak) &&
      Number(s.price) < standardTotal
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, s) => (Number(s.price) < Number(best.price) ? s : best));
}

/**
 * Total price for a session: hourly rate × duration, unless an active special
 * for that exact session length is cheaper.
 */
export function calculateBookingTotal(
  hourlyRate: number,
  durationHours: number,
  specials: PricingSpecial[] = [],
  isPeak = false
): { total: number; special: PricingSpecial | null } {
  const standardTotal = Math.round(hourlyRate * durationHours * 100) / 100;
  const special = findApplicableSpecial(specials, durationHours, isPeak, standardTotal);
  return {
    total: special ? Number(special.price) : standardTotal,
    special,
  };
}

/** Session lengths (in hours) the venue offers, including any special durations. */
export function durationOptions(specials: PricingSpecial[] = []): number[] {
  const base = [1, 2, 3, 4];
  const extra = specials
    .filter((s) => s.is_active)
    .map((s) => s.duration_minutes / 60)
    .filter((h) => h > 0 && h <= 4 && !base.includes(h));
  return Array.from(new Set([...base, ...extra])).sort((a, b) => a - b);
}


/** Peak rate of the venue's walk-in tier (0 when no pricing is configured). */
export function defaultPeakRate(tiers: TierConfig[]): number {
  const def = getDefaultTier(tiers);
  return def ? Number(def.hourly_rate) : 0;
}

/** Off-peak rate of the venue's walk-in tier (falls back to its peak rate). */
export function defaultOffPeakRate(tiers: TierConfig[]): number {
  const def = getDefaultTier(tiers);
  if (!def) return 0;
  return Number(def.off_peak_hourly_rate ?? def.hourly_rate);
}

/**
 * Gets the hourly rate for a tier at a given date/time, driven entirely by the
 * tier row:
 *   - `off_peak_hourly_rate` is used outside peak hours when set
 *   - `restricted_to_off_peak` tiers pay the walk-in peak rate during peak
 *   - unknown/unconfigured tiers fall back to the walk-in tier's rate
 *   - public holidays are charged at the peak rate all day
 * Returns 0 when the venue has no pricing configured at all.
 */
export function calculateHourlyRate(
  tier: string,
  date: Date,
  startTime: string,
  tiers: TierConfig[],
  options?: {
    segment?: string | null;
    holidaySurchargePercent?: number;
    isPublicHoliday?: boolean;
  }
): number {
  const isPeak = isPeakTime(date, startTime, options?.isPublicHoliday ?? false);
  const walkInPeak = defaultPeakRate(tiers);


  let baseRate: number;

  // Staff get free play during off-peak, walk-in rate during peak
  if (options?.segment === "staff") {
    baseRate = isPeak ? walkInPeak : 0;
  } else {
    const config = findTier(tiers, tier);
    if (!config) {
      baseRate = isPeak ? walkInPeak : defaultOffPeakRate(tiers);
    } else if (config.restricted_to_off_peak && isPeak) {
      baseRate = walkInPeak;
    } else if (!isPeak && config.off_peak_hourly_rate !== null) {
      baseRate = Number(config.off_peak_hourly_rate);
    } else {
      baseRate = Number(config.hourly_rate);
    }
  }

  // Apply public holiday surcharge if applicable. Free play stays free.
  const surcharge = options?.holidaySurchargePercent ?? 0;
  if (surcharge > 0 && baseRate > 0) {
    return Math.round((baseRate * (1 + surcharge / 100)) * 100) / 100;
  }
  return baseRate;
}

/**
 * Format a Date as YYYY-MM-DD using local time (matches DB date column format).
 */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns a display label for the pricing period
 */
export function getPricingLabel(date: Date, startTime: string): "peak" | "off-peak" {
  return isPeakTime(date, startTime) ? "peak" : "off-peak";
}

/**
 * Format day name for display
 */
export function getDayName(date: Date): string {
  return date.toLocaleDateString("en-AU", { weekday: "long" });
}
