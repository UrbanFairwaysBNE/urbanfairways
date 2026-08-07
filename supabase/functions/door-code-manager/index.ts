import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { TuyaClient, getTuyaCredentials } from "../_shared/tuya.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BNE_OFFSET = "+10:00"; // Australia/Brisbane, no DST

interface Settings {
  mode: "fixed" | "daily" | "per_booking" | "unstaffed_only";
  fixed_code: string;
  code_length: number;
  append_hash: boolean;
  valid_from_minutes_before: number;
  valid_until_minutes_after: number;
  provider: "manual" | "tuya";
  tuya_device_id: string | null;
  tuya_region: string;
  enabled: boolean;
}

async function getSettings(): Promise<Settings> {
  const { data } = await supabase
    .from("door_access_settings")
    .select("*")
    .eq("id", "global")
    .maybeSingle();
  return (data || {
    mode: "fixed",
    fixed_code: "7675#",
    code_length: 6,
    append_hash: true,
    valid_from_minutes_before: 20,
    valid_until_minutes_after: 1,
    provider: "manual",
    tuya_device_id: null,
    tuya_region: "us",
    enabled: false,
  }) as Settings;
}

async function logEvent(
  doorCodeId: string | null,
  bookingId: string | null,
  eventType: string,
  detail: Record<string, unknown> = {},
) {
  await supabase.from("door_code_events").insert({
    door_code_id: doorCodeId,
    booking_id: bookingId,
    event_type: eventType,
    detail,
  });
}

function bookingWindow(booking: any, s: Settings) {
  const startMs = Date.parse(`${booking.booking_date}T${booking.start_time}${BNE_OFFSET}`);
  const endMs = Date.parse(`${booking.booking_date}T${booking.end_time}${BNE_OFFSET}`);
  return {
    validFrom: new Date(startMs - s.valid_from_minutes_before * 60_000),
    validUntil: new Date(endMs + s.valid_until_minutes_after * 60_000),
    startMs,
    endMs,
  };
}

/** Numeric code that doesn't clash with any other live code or the fixed code. */
async function generateUniqueCode(s: Settings): Promise<string> {
  // HARD RULE: this keypad only ever accepts 6-digit codes. Tuya's cloud returns
  // success for other lengths but the device never takes them (stuck at delivery
  // phase 11, no slot assigned), so any other length is a silently dead code.
  const len = 6;
  const max = 10 ** len;
  const fixedDigits = (s.fixed_code || "").replace(/\D/g, "");

  const { data: live } = await supabase
    .from("door_codes")
    .select("code")
    .gt("valid_until", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const taken = new Set<string>((live || []).map((r: any) => r.code));
  if (fixedDigits) taken.add(fixedDigits);

  for (let i = 0; i < 200; i++) {
    const n = Math.floor(Math.random() * max);
    const code = String(n).padStart(len, "0");
    if (code === "0".repeat(len) || code === "1".repeat(len)) continue;
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not generate a unique door code");
}

async function getTuya(s: Settings, force = false): Promise<TuyaClient | null> {
  if (!force && (s.provider !== "tuya" || !s.enabled)) return null;
  const creds = getTuyaCredentials();
  if (!creds || !s.tuya_device_id) return null;
  return new TuyaClient({
    accessId: creds.accessId,
    accessSecret: creds.accessSecret,
    region: s.tuya_region || "us",
    deviceId: s.tuya_device_id,
  });
}

/**
 * Staff test code — a real per-booking-style code pushed to the keypad with an
 * explicit window, without touching live customer settings. Works even while
 * "Push codes to the keypad" is off, so testing can't affect real bookings.
 */
async function issueTestCode(opts: {
  valid_from: string;
  valid_until: string;
  code?: string;
  label?: string;
}) {
  const s = await getSettings();
  const validFrom = new Date(opts.valid_from);
  const validUntil = new Date(opts.valid_until);
  if (isNaN(validFrom.getTime()) || isNaN(validUntil.getTime())) {
    return { success: false, error: "Invalid valid_from / valid_until" };
  }
  if (validUntil <= validFrom) {
    return { success: false, error: "End time must be after start time" };
  }

  const requested = (opts.code || "").replace(/\D/g, "");
  if (requested && requested.length !== 6) {
    return {
      success: false,
      error: `Code must be exactly 6 digits — this keypad silently ignores any other length (got ${requested.length}).`,
    };
  }
  const code = requested || (await generateUniqueCode(s));
  const label = opts.label || "Staff test";

  const { data: inserted, error } = await supabase
    .from("door_codes")
    .insert({
      booking_id: null,
      user_id: null,
      code,
      scope: "test",
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      status: "pending",
      provider: "tuya",
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  const tuya = await getTuya(s, true);
  if (!tuya) {
    await supabase
      .from("door_codes")
      .update({ status: "failed", last_error: "Tuya credentials or device ID missing" })
      .eq("id", inserted.id);
    return { success: false, error: "Tuya credentials or device ID missing", code };
  }

  const startedAt = Date.now();
  try {
    const { ref, via } = await tuya.issueTempPassword({
      code,
      name: label.slice(0, 30),
      effectiveTime: validFrom,
      invalidTime: validUntil,
    });
    const ms = Date.now() - startedAt;
    await supabase
      .from("door_codes")
      .update({ status: "active", provider_ref: ref, last_error: null })
      .eq("id", inserted.id);
    await logEvent(inserted.id, null, "test_issued", { ref, via, ms, label });
    return {
      success: true,
      code,
      door_code_id: inserted.id,
      via,
      push_ms: ms,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
    };
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from("door_codes")
      .update({ status: "failed", last_error: msg })
      .eq("id", inserted.id);
    await logEvent(inserted.id, null, "test_push_failed", { error: msg });
    return { success: false, error: msg, code, door_code_id: inserted.id };
  }
}

/**
 * Named staff / contractor code.
 * Tuya has no true "permanent" temp-password API — the only permanent code is
 * the one programmed on the keypad itself. So a permanent code here is a temp
 * password with the expiry pushed 10 years out, which behaves identically and
 * can still be revoked instantly.
 */
async function issueNamedCode(opts: {
  label: string;
  code?: string;
  permanent?: boolean;
  valid_from?: string;
  valid_until?: string;
}) {
  const s = await getSettings();
  const label = (opts.label || "").trim();
  if (!label) return { success: false, error: "Name is required" };

  const permanent = opts.permanent !== false;
  const validFrom = opts.valid_from ? new Date(opts.valid_from) : new Date();
  const validUntil = permanent
    ? new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000)
    : new Date(opts.valid_until || "");
  if (isNaN(validFrom.getTime()) || isNaN(validUntil.getTime())) {
    return { success: false, error: "Invalid start/end date" };
  }
  if (validUntil <= validFrom) return { success: false, error: "End must be after start" };

  const requested = (opts.code || "").replace(/\D/g, "");
  if (requested && requested.length !== 6) {
    return {
      success: false,
      error: `Code must be exactly 6 digits — this keypad silently ignores any other length (got ${requested.length}).`,
    };
  }
  const code = requested || (await generateUniqueCode(s));

  const { data: inserted, error } = await supabase
    .from("door_codes")
    .insert({
      booking_id: null,
      user_id: null,
      code,
      label,
      scope: "staff",
      is_permanent: permanent,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      status: "pending",
      provider: "tuya",
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  const tuya = await getTuya(s, true);
  if (!tuya) {
    await supabase
      .from("door_codes")
      .update({ status: "failed", last_error: "Tuya credentials or device ID missing" })
      .eq("id", inserted.id);
    return { success: false, error: "Tuya credentials or device ID missing", code };
  }

  try {
    const { ref, via } = await tuya.issueTempPassword({
      code,
      name: label.slice(0, 30),
      effectiveTime: validFrom,
      invalidTime: validUntil,
    });
    await supabase
      .from("door_codes")
      .update({ status: "active", provider_ref: ref, last_error: null })
      .eq("id", inserted.id);
    await logEvent(inserted.id, null, "staff_code_issued", { ref, via, label, permanent });
    return {
      success: true,
      code,
      door_code_id: inserted.id,
      via,
      label,
      permanent,
      valid_until: validUntil.toISOString(),
    };
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from("door_codes")
      .update({ status: "failed", last_error: msg })
      .eq("id", inserted.id);
    await logEvent(inserted.id, null, "staff_code_failed", { error: msg, label });
    return { success: false, error: msg, code, door_code_id: inserted.id };
  }
}

/* ------------------------------------------------------------------ *
 * Daily rotating code
 * A "door day" runs 04:00 → 04:00 Brisbane. At 04:00 the previous day's
 * code is revoked (removed from the keypad) and a fresh random 6-digit
 * code is issued and pushed for the new day.
 * ------------------------------------------------------------------ */

/** The door-day (YYYY-MM-DD) that the given instant belongs to. */
function currentDoorDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 10 * 3600 * 1000 - 4 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

function doorDayWindow(day: string) {
  const validFrom = new Date(`${day}T04:00:00${BNE_OFFSET}`);
  const validUntil = new Date(validFrom.getTime() + 24 * 3600 * 1000);
  return { validFrom, validUntil };
}

/**
 * Ensures a live daily code exists for the current door-day, revoking any
 * daily code from a previous day. Idempotent — safe to call from the 4am cron,
 * the sync sweep, or an email send.
 */
async function ensureDailyCode(opts: { rotate?: boolean } = {}) {
  const s = await getSettings();
  const day = currentDoorDay();
  const { validFrom, validUntil } = doorDayWindow(day);

  // Existing daily codes
  const { data: dailies } = await supabase
    .from("door_codes")
    .select("*")
    .eq("scope", "daily")
    .in("status", ["pending", "active"]);

  let current = (dailies || []).find(
    (r: any) => r.valid_from === validFrom.toISOString() && !opts.rotate,
  );

  // Revoke yesterday's (or all, when forcing a rotation)
  for (const row of dailies || []) {
    if (current && row.id === current.id) continue;
    await revokeCode(row, s, opts.rotate ? "daily code rotated" : "previous day's daily code");
  }

  if (current) {
    // Retry the keypad push if it never landed
    if (current.status === "pending") {
      await pushToProvider(current, s, `Daily ${day}`);
      const { data: refreshed } = await supabase
        .from("door_codes")
        .select("*")
        .eq("id", current.id)
        .maybeSingle();
      current = refreshed || current;
    }
    return {
      success: true,
      day,
      code: current.code,
      door_code_id: current.id,
      status: current.status,
      created: false,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
    };
  }

  const code = await generateUniqueCode(s);
  const { data: inserted, error } = await supabase
    .from("door_codes")
    .insert({
      booking_id: null,
      user_id: null,
      code,
      label: `Daily ${day}`,
      scope: "daily",
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      status: "pending",
      provider: s.provider,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  const push = await pushToProvider(inserted, s, `Daily ${day}`);
  await logEvent(inserted.id, null, "daily_code_issued", { day, ...push });

  return {
    success: true,
    day,
    code,
    door_code_id: inserted.id,
    created: true,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
    ...push,
  };
}

/** Today's daily code, if one exists (no side effects). */
async function getDailyCode() {
  const day = currentDoorDay();
  const { validFrom } = doorDayWindow(day);
  const { data } = await supabase
    .from("door_codes")
    .select("id, code, status, valid_from, valid_until")
    .eq("scope", "daily")
    .eq("valid_from", validFrom.toISOString())
    .in("status", ["pending", "active"])
    .maybeSingle();
  return { success: true, day, code: (data as any)?.code || null, row: data || null };
}


/** Whether this booking should get its own code, given the mode. */
async function shouldIssueForBooking(booking: any, s: Settings): Promise<boolean> {
  if (s.mode === "per_booking") return true;
  if (s.mode === "unstaffed_only") {
    const dow = new Date(`${booking.booking_date}T00:00:00${BNE_OFFSET}`).getUTCDay();
    const { data: staffed } = await supabase
      .from("staffed_hours")
      .select("is_staffed, start_time, end_time")
      .eq("day_of_week", dow)
      .maybeSingle();
    if (!staffed || !(staffed as any).is_staffed) return true;
    const st = (staffed as any).start_time as string;
    const en = (staffed as any).end_time as string;
    // Unstaffed if the booking starts before staff arrive or ends after they leave
    return booking.start_time < st || booking.end_time > en;
  }
  return false;
}

async function pushToProvider(codeRow: any, s: Settings, bookingLabel: string) {
  const tuya = await getTuya(s);
  if (!tuya) {
    await supabase
      .from("door_codes")
      .update({ status: "active", provider: "manual", last_error: null })
      .eq("id", codeRow.id);
    await logEvent(codeRow.id, codeRow.booking_id, "issued_manual", { code: codeRow.code });
    return { pushed: false };
  }
  try {
    const { ref, via } = await tuya.issueTempPassword({
      code: codeRow.code,
      name: bookingLabel.slice(0, 30),
      effectiveTime: new Date(codeRow.valid_from),
      invalidTime: new Date(codeRow.valid_until),
    });
    await supabase
      .from("door_codes")
      .update({ status: "active", provider: "tuya", provider_ref: ref, last_error: null })
      .eq("id", codeRow.id);
    await logEvent(codeRow.id, codeRow.booking_id, "issued_tuya", { ref, via });
    return { pushed: true, ref };
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from("door_codes")
      .update({ status: "pending", last_error: msg })
      .eq("id", codeRow.id);
    await logEvent(codeRow.id, codeRow.booking_id, "push_failed", { error: msg });
    return { pushed: false, error: msg };
  }
}

async function revokeCode(codeRow: any, s: Settings, reason: string) {
  const tuya = await getTuya(s, codeRow.scope === "test" || codeRow.scope === "staff");

  let removalError: string | null = null;
  if (tuya && codeRow.provider === "tuya" && codeRow.provider_ref) {
    try {
      await tuya.deleteTempPassword(codeRow.provider_ref);
    } catch (e) {
      removalError = (e as Error).message;
      await logEvent(codeRow.id, codeRow.booking_id, "revoke_failed", { error: removalError });
    }
  }
  // If the keypad removal failed we still mark it revoked locally, but keep the
  // error so the sync sweep retries — otherwise a "revoked" code could still
  // physically open the door.
  await supabase
    .from("door_codes")
    .update({ status: "revoked", last_error: removalError })
    .eq("id", codeRow.id);
  await logEvent(codeRow.id, codeRow.booking_id, "revoked", {
    reason,
    removed_from_keypad: !removalError,
  });
}

async function issueForBooking(bookingId: string, force = false) {
  const s = await getSettings();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id, booking_date, start_time, end_time, status, bay_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { success: false, error: "Booking not found" };
  if (booking.status !== "confirmed") return { success: false, error: "Booking not confirmed" };

  if (!force && !(await shouldIssueForBooking(booking, s))) {
    return { success: true, skipped: true, reason: `mode=${s.mode}` };
  }

  const { validFrom, validUntil } = bookingWindow(booking, s);

  // Existing live code for this booking? Just re-sync its window (extend case).
  const { data: existing } = await supabase
    .from("door_codes")
    .select("*")
    .eq("booking_id", bookingId)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (existing) {
    const changed =
      existing.valid_from !== validFrom.toISOString() ||
      existing.valid_until !== validUntil.toISOString();
    if (changed) {
      await supabase
        .from("door_codes")
        .update({ valid_from: validFrom.toISOString(), valid_until: validUntil.toISOString() })
        .eq("id", existing.id);
      await logEvent(existing.id, bookingId, "window_updated", {
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
      });
      // Re-push so the keypad matches the new window (same code, new expiry)
      const tuya = await getTuya(s);
      if (tuya && existing.provider_ref) {
        try {
          await tuya.deleteTempPassword(existing.provider_ref);
        } catch { /* best effort */ }
      }
      const refreshed = { ...existing, valid_from: validFrom.toISOString(), valid_until: validUntil.toISOString() };
      await pushToProvider(refreshed, s, `Booking ${booking.booking_date}`);
    }
    return { success: true, code: existing.code, updated: changed };
  }

  const code = await generateUniqueCode(s);
  const { data: inserted, error } = await supabase
    .from("door_codes")
    .insert({
      booking_id: bookingId,
      user_id: booking.user_id,
      code,
      scope: "booking",
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      status: "pending",
      provider: s.provider,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  const push = await pushToProvider(inserted, s, `Booking ${booking.booking_date}`);
  return { success: true, code, ...push };
}

async function revokeForBooking(bookingId: string, reason: string) {
  const s = await getSettings();
  const { data: rows } = await supabase
    .from("door_codes")
    .select("*")
    .eq("booking_id", bookingId)
    .in("status", ["pending", "active"]);
  for (const row of rows || []) await revokeCode(row, s, reason);
  return { success: true, revoked: (rows || []).length };
}

/**
 * Reconciliation pass — the safety net.
 * - expires codes whose window has passed
 * - retries failed pushes
 * - re-derives windows straight from the live booking row (catches extends /
 *   reschedules that never called us)
 * - revokes codes for bookings that are no longer confirmed
 */
async function syncAll() {
  const s = await getSettings();
  const now = new Date();
  let expired = 0, retried = 0, corrected = 0, revoked = 0;

  // Expire finished codes
  const { data: past } = await supabase
    .from("door_codes")
    .select("*")
    .in("status", ["pending", "active"])
    .lt("valid_until", now.toISOString());
  for (const row of past || []) {
    const tuya = await getTuya(s, row.scope === "test" || row.scope === "staff");

    if (tuya && row.provider_ref) {
      try { await tuya.deleteTempPassword(row.provider_ref); } catch { /* best effort */ }
    }
    await supabase.from("door_codes").update({ status: "expired" }).eq("id", row.id);
    await logEvent(row.id, row.booking_id, "expired", {});
    expired++;
  }

  // Live codes: verify against their booking
  const { data: live } = await supabase
    .from("door_codes")
    .select("*")
    .in("status", ["pending", "active"])
    .gte("valid_until", now.toISOString());

  for (const row of live || []) {
    if (!row.booking_id) continue;
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_date, start_time, end_time, status")
      .eq("id", row.booking_id)
      .maybeSingle();

    if (!booking || booking.status !== "confirmed") {
      await revokeCode(row, s, "booking no longer confirmed");
      revoked++;
      continue;
    }

    const { validFrom, validUntil } = bookingWindow(booking, s);
    if (
      row.valid_from !== validFrom.toISOString() ||
      row.valid_until !== validUntil.toISOString()
    ) {
      await supabase
        .from("door_codes")
        .update({ valid_from: validFrom.toISOString(), valid_until: validUntil.toISOString() })
        .eq("id", row.id);
      await logEvent(row.id, row.booking_id, "window_corrected", {
        valid_until: validUntil.toISOString(),
      });
      const tuya = await getTuya(s);
      if (tuya && row.provider_ref) {
        try { await tuya.deleteTempPassword(row.provider_ref); } catch { /* best effort */ }
      }
      await pushToProvider(
        { ...row, valid_from: validFrom.toISOString(), valid_until: validUntil.toISOString() },
        s,
        `Booking ${booking.booking_date}`,
      );
      corrected++;
      continue;
    }

    if (row.status === "pending" && s.provider === "tuya" && s.enabled) {
      await pushToProvider(row, s, `Booking ${booking.booking_date}`);
      retried++;
    }
  }

  // Retry keypad removal for codes revoked locally but still present on the
  // device, while they are still inside their validity window.
  let reRevoked = 0;
  const { data: stuckRevoked } = await supabase
    .from("door_codes")
    .select("*")
    .eq("status", "revoked")
    .not("provider_ref", "is", null)
    .not("last_error", "is", null)
    .gte("valid_until", now.toISOString());
  for (const row of stuckRevoked || []) {
    const tuya = await getTuya(s, row.scope === "test" || row.scope === "staff");
    if (!tuya) break;
    try {
      await tuya.deleteTempPassword(row.provider_ref);
      await supabase.from("door_codes").update({ last_error: null }).eq("id", row.id);
      await logEvent(row.id, row.booking_id, "revoke_retry_succeeded", {});
      reRevoked++;
    } catch { /* keep last_error, try again next sweep */ }
  }

  // Backfill: confirmed upcoming bookings that should have a code but don't
  if (s.mode === "per_booking" || s.mode === "unstaffed_only") {
    const todayBne = new Date(Date.now() + 10 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: upcoming } = await supabase
      .from("bookings")
      .select("id, booking_date, start_time, end_time, status, user_id")
      .eq("status", "confirmed")
      .gte("booking_date", todayBne)
      .limit(500);
    for (const b of upcoming || []) {
      const { validFrom } = bookingWindow(b, s);
      if (validFrom.getTime() > Date.now() + 24 * 3600 * 1000) continue;
      const { data: has } = await supabase
        .from("door_codes")
        .select("id")
        .eq("booking_id", b.id)
        .in("status", ["pending", "active"])
        .maybeSingle();
      if (!has) await issueForBooking(b.id);
    }
  }

  // Daily rotating mode: make sure today's code exists and yesterday's is gone
  let daily: unknown = null;
  if (s.mode === "daily") daily = await ensureDailyCode();

  return { success: true, expired, retried, corrected, revoked, reRevoked, daily };

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "sync";
    let result: unknown;

    switch (action) {
      case "issue":
        result = await issueForBooking(body.booking_id, !!body.force);
        break;
      case "refresh": // extend / reschedule — same code, new window
        result = await issueForBooking(body.booking_id, !!body.force);
        break;
      case "revoke":
        if (body.door_code_id) {
          const s = await getSettings();
          const { data: row } = await supabase
            .from("door_codes")
            .select("*")
            .eq("id", body.door_code_id)
            .maybeSingle();
          if (row) await revokeCode(row, s, body.reason || "manual");
          result = { success: true };
        } else {
          result = await revokeForBooking(body.booking_id, body.reason || "manual");
        }
        break;
      case "issue_test":
        result = await issueTestCode({
          valid_from: body.valid_from,
          valid_until: body.valid_until,
          code: body.code,
          label: body.label,
        });
        break;
      case "issue_named":
        result = await issueNamedCode({
          label: body.label,
          code: body.code,
          permanent: body.permanent,
          valid_from: body.valid_from,
          valid_until: body.valid_until,
        });
        break;

      case "daily_ensure": // 4am cron / on-demand: rotate to today's code
        result = await ensureDailyCode({ rotate: !!body.rotate });
        break;

      case "daily_get":
        result = await getDailyCode();
        break;

      case "sync":
        result = await syncAll();
        break;


      case "test": {
        const s = await getSettings();
        const creds = getTuyaCredentials();
        if (!creds) {
          result = { success: false, error: "TUYA_ACCESS_ID / TUYA_ACCESS_SECRET not configured" };
          break;
        }
        if (!s.tuya_device_id) {
          result = { success: false, error: "No Tuya device ID saved in settings" };
          break;
        }
        const client = new TuyaClient({
          accessId: creds.accessId,
          accessSecret: creds.accessSecret,
          region: s.tuya_region || "us",
          deviceId: s.tuya_device_id,
        });
        const [device, specs] = await Promise.all([
          client.getDevice().catch((e) => ({ error: (e as Error).message })),
          client.getSpecifications().catch((e) => ({ error: (e as Error).message })),
        ]);
        result = { success: true, capabilities: { device, specifications: specs } };
        break;
      }
      case "device_passwords": {
        const s = await getSettings();
        const tuya = await getTuya(s, true);
        if (!tuya) {
          result = { success: false, error: "Tuya credentials or device ID missing" };
          break;
        }
        const list = await tuya
          .listTempPasswords()
          .catch((e) => ({ error: (e as Error).message }));
        result = { success: true, passwords: list };
        break;
      }
      case "unlock": {
        const s = await getSettings();
        const tuya = await getTuya(s);
        if (!tuya) {
          result = { success: false, error: "Tuya provider not enabled/configured" };
          break;
        }
        await tuya.unlockNow();
        await logEvent(null, null, "remote_unlock", {});
        result = { success: true };
        break;
      }
      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[door-code-manager]", e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
