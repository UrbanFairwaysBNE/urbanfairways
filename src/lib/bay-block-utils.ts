export const MAX_BLOCK_HOURS = 10;
export const BLOCK_DURATION_OPTIONS = Array.from({ length: 20 }, (_, index) => {
  const hours = (index + 1) / 2;
  return { value: String(hours), label: `${hours} hour${hours === 1 ? "" : "s"}` };
});

export function blockEndTime(start: string, hours: number, openTime: string, closeTime: string): string {
  const minutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  if (!Number.isFinite(hours) || hours < 0.5 || hours > MAX_BLOCK_HOURS || !Number.isInteger(hours * 2)) {
    throw new Error("Block duration must be between 30 minutes and 10 hours in 30-minute steps.");
  }
  const startMinutes = minutes(start);
  const endMinutes = startMinutes + hours * 60;
  if (!Number.isFinite(startMinutes) || startMinutes < minutes(openTime) || endMinutes > minutes(closeTime)) {
    throw new Error("Block must fit within the selected day's operating hours.");
  }
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}

/**
 * Full-day block: spans the day's entire operating hours.
 * Deliberately exempt from the MAX_BLOCK_HOURS cap — "all day" is the whole day.
 */
export function allDaySpan(openTime: string, closeTime: string): { start: string; end: string; hours: number } {
  const minutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const open = minutes(openTime);
  const close = minutes(closeTime);
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) {
    throw new Error("All-day blocks need a date with valid operating hours.");
  }
  return { start: openTime, end: closeTime, hours: (close - open) / 60 };
}