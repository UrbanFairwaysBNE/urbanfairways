/**
 * Brisbane time formatting helpers.
 *
 * This app operates entirely in Australia/Brisbane (AEST, UTC+10, no DST).
 * NEVER render a timestamp with a bare `toLocaleString()` — that uses the
 * viewer's device timezone, which produces wrong times for staff checking
 * the Hub from another region and makes UTC values from the database look
 * like they happened ~10 hours earlier than they did.
 */

export const BRISBANE_TZ = "Australia/Brisbane";

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "27 Jul 2026, 9:14 am" */
export function formatBrisbane(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** e.g. "9:14 am" */
export function formatBrisbaneTime(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** e.g. "27 Jul 2026" */
export function formatBrisbaneDate(value: DateInput, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
