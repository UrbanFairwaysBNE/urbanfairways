// Peak/off-peak pricing utilities.
// All rates and tier behaviour come from `pricing_config` (see src/lib/tier-config.ts).
// Nothing here hardcodes a tier key, tier name or dollar amount.

import { TierConfig, findTier, getDefaultTier } from "@/lib/tier-config";

/**
 * Venue off-peak windows (Brisbane local time), by day of week.
 * Off-peak: Mon–Fri 5:30am–4:00pm, Sat–Sun 5:30am–10:00am.
 * Everything outside these windows (and all public holidays) is peak.
 */
export const OFF_PEAK_WINDOWS: Record<number, { start: string; end: string }> = {
  0: { start: "05:30", end: "10:00" }, // Sunday
  1: { start: "05:30", end: "16:00" },
  2: { start: "05:30", end: "16:00" },
  3: { start: "05:30", end: "16:00" },
  4: { start: "05:30", end: "16:00" },
  5: { start: "05:30", end: "16:00" },
  6: { start: "05:30", end: "10:00" }, // Saturday
};

/** Format "16:00" as "4:00pm". */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")}${suffix}`;
}

/** Off-peak windows rendered as display lines, e.g. ["Mon–Fri 5:30am – 4:00pm", ...]. */
export function offPeakLines(): string[] {
  const week = OFF_PEAK_WINDOWS[1];
  const weekend = OFF_PEAK_WINDOWS[6];
  return [
    `Mon–Fri ${formatClock(week.start)} – ${formatClock(week.end)}`,
    `Sat–Sun ${formatClock(weekend.start)} – ${formatClock(weekend.end)}`,
  ];
}

/** Peak windows rendered as display lines, given the venue closing time. */
export function peakLines(closeTime = "23:00"): string[] {
  const week = OFF_PEAK_WINDOWS[1];
  const weekend = OFF_PEAK_WINDOWS[6];
  return [
    `Mon–Fri ${formatClock(week.end)} – ${formatClock(closeTime)}`,
    `Sat–Sun ${formatClock(weekend.end)} – ${formatClock(closeTime)}`,
    "Public holidays all day",
  ];
}

/** Human-readable summary of the off-peak windows, for UI copy. */
export const OFF_PEAK_SUMMARY = "Mon–Fri 5:30am–4:00pm, Sat–Sun 5:30am–10:00am";
/** Human-readable summary of peak hours, for UI copy. */
export const PEAK_SUMMARY = "Mon–Fri from 4:00pm, Sat–Sun from 10:00am";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Determines if a given date and time is during peak hours.
 * Off-peak: Mon–Fri 5:30am–4:00pm, Sat–Sun 5:30am–10:00am. Everything else is peak.
 * Public holidays are treated as peak all day (pass `isPublicHoliday`).
 */
export function isPeakTime(date: Date, startTime: string, isPublicHoliday = false): boolean {
  if (isPublicHoliday) return true;

  const window = OFF_PEAK_WINDOWS[date.getDay()];
  if (!window) return true;

  const minutes = toMinutes(startTime);
  return !(minutes >= toMinutes(window.start) && minutes < toMinutes(window.end));
}

/**
 * True when a time falls in the off-peak window. Tiers flagged
 * `restricted_to_off_peak` only get their member rate in this window.
 */
export function isOffPeakTime(date: Date, startTime: string, isPublicHoliday = false): boolean {
  return !isPeakTime(date, startTime, isPublicHoliday);
}

/**
 * Resolve a customer's custom rate override for a given slot.
 * `custom_hourly_rate` is the off-peak/base override, `custom_hourly_rate_peak`
 * the optional peak override. When only the base rate is set it applies to all
 * hours (backwards compatible with single-rate overrides).
 * Returns null when the customer has no override.
 */
export function resolveCustomRate(
  customRate: number | null | undefined,
  customPeakRate: number | null | undefined,
  isPeak: boolean,
): number | null {
  if (isPeak && customPeakRate !== null && customPeakRate !== undefined) {
    return Number(customPeakRate);
  }
  if (customRate !== null && customRate !== undefined) return Number(customRate);
  if (customPeakRate !== null && customPeakRate !== undefined) return Number(customPeakRate);
  return null;
}



/** Add a (possibly fractional) number of hours to a HH:MM time string. */
export function addDurationToTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + Math.round(durationHours * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Price of extending a live session by `hours` (0.5 increments allowed).
 *
 * A tier may define flat extension pricing in `pricing_config`
 * (`extend_60min_price`, and optionally `extend_30min_price`). When set, that
 * price applies regardless of peak/off-peak. Tiers with no extension pricing
 * fall back to their normal per-slot hourly rate.
 */
export function calculateExtensionCost(
  tier: string,
  date: Date,
  fromTime: string,
  hours: number,
  tiers: TierConfig[],
  options?: { segment?: string | null; isPublicHoliday?: boolean },
): number {
  const config = findTier(tiers, tier);
  const flatHour = config?.extend_60min_price ?? null;

  if (options?.segment !== "staff" && flatHour !== null) {
    const flatHalf = config?.extend_30min_price ?? flatHour / 2;
    const halves = Math.round(hours * 2);
    const wholeHours = Math.floor(halves / 2);
    const extraHalf = halves % 2;
    return Math.round((wholeHours * flatHour + extraHalf * flatHalf) * 100) / 100;
  }

  let total = 0;
  const halves = Math.round(hours * 2);
  for (let i = 0; i < halves; i++) {
    const slot = addDurationToTime(fromTime, i * 0.5);
    total +=
      calculateHourlyRate(tier, date, slot, tiers, {
        segment: options?.segment,
        isPublicHoliday: options?.isPublicHoliday,
      }) / 2;
  }
  return Math.round(total * 100) / 100;
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
