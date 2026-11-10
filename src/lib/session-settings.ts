// Session settings preparation for the Bay Controller.
// GSPro reads its settings files while it starts, so files are written for a
// booking BEFORE GSPro launches: at power-on (T-3m) for a standalone booking,
// and after the outgoing apps are verified closed during a changeover.

export type SettingsPrepStatus = 'applied' | 'baseline' | 'disabled' | 'skipped_running' | 'failed';

export interface SettingsPrepResult {
  status: SettingsPrepStatus;
  files: string[];
  detail?: string;
}

export interface SessionBookingLike {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  user_id?: string | null;
}

/** Statuses after which the files on disk belong to this booking. */
const FINAL: SettingsPrepStatus[] = ['applied', 'baseline', 'disabled'];

export function settingsKey(booking: Pick<SessionBookingLike, 'id' | 'user_id'> | null | undefined) {
  return booking ? `${booking.id}:${booking.user_id ?? 'none'}` : null;
}

/**
 * Serialises every settings write and remembers whose files are on disk, so
 * power-on, launch and changeover share one write per booking. A write that
 * was refused because GSPro is open, or that failed, is not remembered and
 * runs again on the next request.
 */
export function createSettingsPreparer() {
  let current: { key: string; promise: Promise<SettingsPrepResult> } | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  return {
    get preparedKey() { return current?.key ?? null; },
    prepare(key: string, run: () => Promise<SettingsPrepResult>): Promise<SettingsPrepResult> {
      if (current?.key === key) return current.promise;
      const promise = tail.then(run);
      tail = promise.catch(() => undefined);
      const entry = { key, promise };
      current = entry;
      promise.then(
        (r) => { if (!FINAL.includes(r.status) && current === entry) current = null; },
        () => { if (current === entry) current = null; },
      );
      return promise;
    },
    /** Something else (e.g. a manual baseline restore) changed the files. */
    invalidate() { current = null; },
  };
}

const live = (b: SessionBookingLike) => b.status === 'confirmed' || b.status === 'pending';
const at = (date: string, time: string) => new Date(`${date}T${time}`).getTime();

/**
 * The booking a launch or power-on is for, read straight from the booking
 * list so a booking created or changed moments ago is never missed. A session
 * that has started wins over one only in its lead-in window.
 */
export function findSessionBooking<T extends SessionBookingLike>(
  bookings: T[], now: Date, today: string, leadMinutes: number,
): T | null {
  const t = now.getTime();
  let started: T | null = null;
  let upcoming: T | null = null;
  for (const b of bookings) {
    if (b.booking_date !== today || !live(b)) continue;
    const start = at(b.booking_date, b.start_time);
    const end = at(b.booking_date, b.end_time);
    if (t >= end || t < start - leadMinutes * 60000) continue;
    if (t >= start) { if (!started || start > at(started.booking_date, started.start_time)) started = b; }
    else if (!upcoming || start < at(upcoming.booking_date, upcoming.start_time)) upcoming = b;
  }
  return started ?? upcoming;
}

/** Back-to-back follow-on: the changeover (or continuing apps) owns its files. */
export function hasPrecedingBooking<T extends SessionBookingLike>(bookings: T[], booking: T) {
  return bookings.some(b => b.id !== booking.id && live(b) && b.booking_date === booking.booking_date && b.end_time === booking.start_time);
}
