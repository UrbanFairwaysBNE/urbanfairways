// Ingest a GSPro driving-range CSV export from the Bay Controller.
// Auth: caller must be a signed-in admin (verified via JWT + has_role).
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { rangeSessionOwner } from "../_shared/range-session-owner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[^\d.\-+eE]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ""; }
        else if (c === '"') inQuotes = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_MAP: Record<string, string> = {
  shot: "shot_number", shotnumber: "shot_number", shotno: "shot_number", no: "shot_number", "#": "shot_number",
  time: "shot_timestamp", timestamp: "shot_timestamp", datetime: "shot_timestamp",
  club: "club_type", clubtype: "club_type", clubname: "club_type",
  ballspeed: "ball_speed", ballspeedmph: "ball_speed",
  clubspeed: "club_speed", clubheadspeed: "club_speed", clubspeedmph: "club_speed",
  smash: "smash_factor", smashfactor: "smash_factor",
  launchangle: "launch_angle", launch: "launch_angle", verticallaunch: "launch_angle", vla: "launch_angle",
  launchdirection: "launch_direction", horizontallaunch: "launch_direction", azimuth: "launch_direction", hla: "launch_direction",
  spin: "spin_rate", spinrate: "spin_rate", totalspin: "spin_rate", spinrpm: "spin_rate",
  spinaxis: "spin_axis", axis: "spin_axis", rawspinaxis: "spin_axis",
  backspin: "back_spin", sidespin: "side_spin",
  carry: "carry", carrydistance: "carry", carryyards: "carry",
  total: "total", totaldistance: "total", totalyards: "total",
  sidecarry: "side_carry", carryside: "side_carry", offlinecarry: "side_carry",
  side: "side_total", sidetotal: "side_total",
  // GSPro exports a single horizontal-error column called "Offline" (yards left/right of target
  // at landing). Treat it as side_carry so dispersion tiles work; side_total falls back to it.
  offline: "side_carry",
  apex: "apex_height", apexheight: "apex_height", peakheight: "apex_height",
  descent: "descent_angle", decent: "descent_angle", descentangle: "descent_angle", landingangle: "descent_angle",
  aoa: "angle_of_attack", angleofattack: "angle_of_attack", attackangle: "angle_of_attack",
  clubpath: "club_path", path: "club_path",
  faceangle: "face_angle", face: "face_angle", facetotarget: "face_angle",
  facetopath: "face_to_path", ftp: "face_to_path",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { user_id, booking_id, bay_id, csv_base64, csv_text, filename } = body ?? {};
  if (!user_id || (!csv_base64 && !csv_text)) return json({ error: "missing_fields" }, 400);

  // Resolve ownership from the stored booking, not the controller's booker ID.
  let ownerId = user_id;
  let sessionBayId = bay_id ?? null;
  if (booking_id) {
    const { data: booking, error } = await admin.from("bookings")
      .select("user_id, booking_type, client_user_id, bay_id")
      .eq("id", booking_id).maybeSingle();
    if (error) return json({ error: "booking_lookup_failed" }, 500);
    if (!booking) return json({ error: "booking_not_found" }, 404);
    try { ownerId = rangeSessionOwner(booking); }
    catch { return json({ error: "lesson_customer_missing" }, 409); }
    sessionBayId = booking.bay_id;
  }

  let csvText: string;
  try {
    csvText = csv_text ?? new TextDecoder().decode(Uint8Array.from(atob(csv_base64), (c) => c.charCodeAt(0)));
  } catch (e) { return json({ error: "invalid_csv_base64", detail: String(e) }, 400); }

  const { headers, rows } = parseCsv(csvText);
  if (headers.length === 0 || rows.length === 0) return json({ error: "empty_csv" }, 400);

  const colMap: (string | null)[] = headers.map((h) => FIELD_MAP[canonical(h)] ?? null);

  // Derive session date/time from a gspro-export MM-DD-YY-HH-MM-SS filename if present.
  // Falls back to DB default (today in Brisbane) when the filename isn't parseable.
  const parseFilenameDate = (name: string | null | undefined): { date: string; iso: string } | null => {
    if (!name) return null;
    const m = String(name).match(/(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [, mm, dd, yy, hh, mi, ss] = m;
    const year = 2000 + Number(yy);
    // Interpret as Brisbane local time (AEST/UTC+10, no DST) then convert to UTC ISO.
    const utcMs = Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh) - 10, Number(mi), Number(ss));
    if (!Number.isFinite(utcMs)) return null;
    return { date: `${year}-${mm}-${dd}`, iso: new Date(utcMs).toISOString() };
  };
  const filenameStamp = parseFilenameDate(filename);

  const { data: session, error: sessErr } = await admin
    .from("range_sessions")
    .insert({
      user_id: ownerId, booking_id: booking_id ?? null, bay_id: sessionBayId,
      shot_count: rows.length, source_filename: filename ?? null,
      ...(filenameStamp ? { session_date: filenameStamp.date, started_at: filenameStamp.iso } : {}),
    })
    .select("id")
    .single();
  if (sessErr || !session) return json({ error: "session_insert_failed", detail: sessErr?.message }, 500);
  const sessionId = session.id;

  const NUMERIC_COLS = new Set([
    "ball_speed","club_speed","smash_factor","launch_angle","launch_direction",
    "spin_rate","spin_axis","back_spin","side_spin","carry","total","side_carry",
    "side_total","apex_height","descent_angle","angle_of_attack","club_path",
    "face_angle","face_to_path",
  ]);

  const shotRows = rows.map((row, idx) => {
    const rec: Record<string, unknown> = { session_id: sessionId, shot_number: idx + 1 };
    const raw: Record<string, string> = {};
    row.forEach((val, i) => {
      const key = colMap[i]; const hdr = headers[i]; raw[hdr] = val;
      if (!key) return;
      if (key === "shot_number") { const n = num(val); if (n !== null) rec.shot_number = n; }
      else if (key === "shot_timestamp") { const t = Date.parse(val); if (!Number.isNaN(t)) rec.shot_timestamp = new Date(t).toISOString(); }
      else if (key === "club_type") { if (val) rec.club_type = val; }
      else if (NUMERIC_COLS.has(key)) { const n = num(val); if (n !== null) rec[key] = n; }
    });
    // GSPro exports BackSpin + SideSpin but no combined "Spin" column. Derive
    // total spin (rpm) from the two axes so Swing Lab's spin tiles have data.
    if (rec.spin_rate == null) {
      const bs = rec.back_spin as number | undefined;
      const ss = (rec.side_spin as number | undefined) ?? 0;
      if (typeof bs === "number" && Number.isFinite(bs)) {
        rec.spin_rate = Math.round(Math.sqrt(bs * bs + ss * ss));
      }
    }
    rec.raw = raw;
    return rec;
  });

  const CHUNK = 500;
  for (let i = 0; i < shotRows.length; i += CHUNK) {
    const { error } = await admin.from("range_shots").insert(shotRows.slice(i, i + CHUNK));
    if (error) return json({ error: "shot_insert_failed", detail: error.message, session_id: sessionId }, 500);
  }

  const stamps = shotRows.map((r) => r.shot_timestamp as string | undefined).filter(Boolean).sort();
  const started = stamps[0] ?? null;
  const ended = stamps[stamps.length - 1] ?? null;
  const durationMin = started && ended ? (new Date(ended).getTime() - new Date(started).getTime()) / 60000 : null;

  const csvPath = `${ownerId}/${sessionId}.csv`;
  const { error: upErr } = await admin.storage.from("range-session-csv").upload(csvPath, new Blob([csvText], { type: "text/csv" }), { upsert: true });
  const finalCsvPath = upErr ? null : csvPath;

  const updatePayload: Record<string, unknown> = { csv_path: finalCsvPath };
  // Only overwrite started/ended if the CSV actually had timestamps — otherwise we keep
  // the filename-derived started_at (or DB default) intact.
  if (started) updatePayload.started_at = started;
  if (ended) updatePayload.ended_at = ended;
  if (durationMin != null) updatePayload.duration_minutes = durationMin;
  await admin.from("range_sessions").update(updatePayload).eq("id", sessionId);

  return json({ ok: true, session_id: sessionId, shot_count: shotRows.length, started_at: started, ended_at: ended, csv_path: finalCsvPath });
});
