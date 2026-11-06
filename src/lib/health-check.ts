// Traffic-light rules for Settings → Health Check.
export type Light = "green" | "amber" | "red" | "none";
export type Metrics = Record<string, number>;
export interface Verdict { light: Light; notes: string[] }

const n = (m: Metrics, k: string) => m[k] ?? 0;

function verdict(reds: [boolean, string][], ambers: [boolean, string][], okNote = "All normal"): Verdict {
  const r = reds.filter(([c]) => c).map(([, t]) => t);
  if (r.length) return { light: "red", notes: [...r, ...ambers.filter(([c]) => c).map(([, t]) => t)] };
  const a = ambers.filter(([c]) => c).map(([, t]) => t);
  if (a.length) return { light: "amber", notes: a };
  return { light: "green", notes: [okNote] };
}

export function bayVerdict(m: Metrics): Verdict {
  const bookings = n(m, "bookings");
  const unresolvedShutdowns = Math.max(0, n(m, "close_unverified") - n(m, "close_recovered"));
  if (!bookings && !n(m, "events")) return { light: "none", notes: ["No bookings or activity"] };
  return verdict(
    [
      [bookings > 0 && n(m, "events") === 0, `Controller silent despite ${bookings} booking(s)`],
      [n(m, "shutdown_loop") > 0, `Shutdown retry loop (${n(m, "shutdown_loop")} events)`],
      [n(m, "forced_off") > 0, `Power forced off with apps still open (${n(m, "forced_off")})`],
      [n(m, "close_fail") >= 3, `Apps failed to close ${n(m, "close_fail")} times`],
      [n(m, "display_fail") > 0, `Launch blocked by screen check ${n(m, "display_fail")} time(s)`],
      [n(m, "controller_crash") > 0, `Controller crashed ${n(m, "controller_crash")} time(s)`],
    ],
    [
      [n(m, "close_fail") > 0 && n(m, "close_fail") < 3, `Apps failed to close ${n(m, "close_fail")} time(s)`],
      [unresolvedShutdowns > 0, `Shutdown could not be verified ${unresolvedShutdowns} time(s); this does not confirm apps stayed open`],
      [n(m, "plug_fail") > 0, `Smart plug didn't respond ${n(m, "plug_fail")} time(s)`],
      [n(m, "unexpected_close") > 0, `GSPro/ProTee closed unexpectedly ${n(m, "unexpected_close")} time(s)`],
      [n(m, "settings_upload_fail") > 0, `Customer settings failed to save (${n(m, "settings_upload_fail")})`],
    ],
    n(m, "close_recovered") > 0
      ? `${bookings} booking(s); closure reported immediately after ${n(m, "close_recovered")} ambiguous shutdown warning(s)`
      : `${bookings} booking(s), ran smoothly`,
  );
}

export function bookingsVerdict(m: Metrics): Verdict {
  return verdict(
    [
      [n(m, "overlaps") > 0, `${n(m, "overlaps")} double booking(s) on a bay`],
      [n(m, "stuck_pending") > 0, `${n(m, "stuck_pending")} online checkout(s) stuck over 10 min`],
    ],
    [[n(m, "unpaid_finished") > 0, `${n(m, "unpaid_finished")} finished booking(s) still unpaid`]],
    `${n(m, "confirmed")} booking(s), no problems`,
  );
}

export function emailsVerdict(m: Metrics): Verdict {
  return verdict(
    [[n(m, "failed") > 0, `${n(m, "failed")} booking confirmation(s) failed to send`]],
    [[n(m, "processing") > 0, `${n(m, "processing")} confirmation(s) still sending`]],
    `${n(m, "sent")} confirmation(s) sent`,
  );
}

export function paymentsVerdict(m: Metrics): Verdict {
  return verdict(
    [],
    [[n(m, "membership_failed") > 0, `${n(m, "membership_failed")} membership payment(s) failed`]],
    `${n(m, "card_bookings")} card booking(s), ${n(m, "membership_payments")} membership payment(s), ${n(m, "pack_sales")} pack sale(s)`,
  );
}

export function membershipsVerdict(m: Metrics): Verdict {
  return verdict(
    [],
    [
      [n(m, "payment_flagged") > 0, `${n(m, "payment_flagged")} member(s) flagged for failed payment`],
      [n(m, "verification_overdue") > 0, `${n(m, "verification_overdue")} Frontline approval(s) waiting over 3 days`],
    ],
    `${n(m, "verification_pending")} approval(s) pending`,
  );
}

export function doorVerdict(m: Metrics): Verdict {
  return verdict(
    [
      [n(m, "daily_code_activated") === 0, "Daily door code was not activated"],
      [n(m, "code_errors") > 0, `${n(m, "code_errors")} door code error(s) from TTLock`],
    ],
    [[n(m, "revoked") === 0, "Yesterday's code was not removed"]],
    "Daily code activated and old code removed",
  );
}

export function packsVerdict(m: Metrics): Verdict {
  return verdict(
    [[n(m, "negative_balance") > 0, `${n(m, "negative_balance")} pack(s) with negative hours`]],
    [[n(m, "overdue_expiry") > 0, `${n(m, "overdue_expiry")} pack(s) past expiry still active`]],
    "Balances look right",
  );
}

export const worst = (ls: Light[]): Light =>
  ls.includes("red") ? "red" : ls.includes("amber") ? "amber" : ls.includes("green") ? "green" : "none";
