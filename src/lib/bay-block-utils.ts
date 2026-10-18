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