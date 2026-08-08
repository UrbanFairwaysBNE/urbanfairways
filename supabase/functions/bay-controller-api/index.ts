import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Version tracking for deployment debugging
const VERSION = "2.2.0";
const HIGHLIGHTS_BUCKET = "league-highlights";
const DEPLOYED_AT = new Date().toISOString();
const SETTINGS_FILES = new Set(["dpsV2x3.gss", "Settings.vgs"]);
const SETTINGS_BUCKET = "gspro-user-settings";
const CSV_BUCKET = "range-session-csv";

// Full CORS headers compatible with supabase-js client
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bay-number, x-app-version, x-action, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to add version info to all responses
const jsonResponse = (data: Record<string, unknown>, status = 200) => {
  return new Response(
    JSON.stringify({
      ...data,
      _version: VERSION,
      _deployed_at: DEPLOYED_AT,
    }),
    { 
      status, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
};

// Helper to determine action from multiple sources
const getAction = (
  url: URL, 
  headers: Headers, 
  body: Record<string, unknown> | null
): string | null => {
  // Priority: header > query param > body
  const headerAction = headers.get("x-action");
  if (headerAction) return headerAction;
  
  const queryAction = url.searchParams.get("action");
  if (queryAction) return queryAction;
  
  if (body && typeof body.action === "string") return body.action;
  
  // Auto-detect log request by payload shape
  if (body && Array.isArray(body.logs)) return "log";
  
  return null;
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
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
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
  side: "side_total", sidetotal: "side_total", offline: "side_carry",
  apex: "apex_height", apexheight: "apex_height", peakheight: "apex_height",
  descent: "descent_angle", decent: "descent_angle", descentangle: "descent_angle", landingangle: "descent_angle",
  aoa: "angle_of_attack", angleofattack: "angle_of_attack", attackangle: "angle_of_attack",
  clubpath: "club_path", path: "club_path",
  faceangle: "face_angle", face: "face_angle", facetotarget: "face_angle",
  facetopath: "face_to_path", ftp: "face_to_path",
};

const parseFilenameDate = (name: string | null | undefined): { date: string; iso: string } | null => {
  if (!name) return null;
  const m = String(name).match(/(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yy, hh, mi, ss] = m;
  const year = 2000 + Number(yy);
  // Bay PC clocks run on venue local time (Australia/Brisbane, AEST/UTC+10, no DST)
  const utcMs = Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh) - VENUE_UTC_OFFSET_HOURS, Number(mi), Number(ss));
  if (!Number.isFinite(utcMs)) return null;
  return { date: `${year}-${mm}-${dd}`, iso: new Date(utcMs).toISOString() };
};

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

serve(async (req) => {
  // Handle CORS preflight with proper response body
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const bayNumber = parseInt(req.headers.get("x-bay-number") || url.searchParams.get("bay") || "0");
    const appVersion = req.headers.get("x-app-version") || "unknown";

    // Parse body once for action detection and payload
    let body: Record<string, unknown> | null = null;
    if (req.method === "POST" || req.method === "PUT") {
      try {
        body = await req.json();
      } catch {
        // Body might be empty or not JSON - that's OK
        body = null;
      }
    }

    const action = getAction(url, req.headers, body);

    console.log(`[${VERSION}] Bay Controller API - Action: ${action || "bookings"}, Bay: ${bayNumber}, Version: ${appVersion}`);

    if (!bayNumber || bayNumber < 1 || bayNumber > MAX_BAY_NUMBER) {
      return jsonResponse({ error: `Invalid bay number. Must be 1-${MAX_BAY_NUMBER}.` }, 400);
    }

    // Get the bay ID from bay number
    const { data: bay, error: bayError } = await supabase
      .from("bays")
      .select("id, name")
      .eq("bay_number", bayNumber)
      .single();

    if (bayError || !bay) {
      console.error(`[${VERSION}] Bay lookup error:`, bayError);
      return jsonResponse({ error: "Bay not found" }, 404);
    }

    const hasBookingAccess = async (userId: string, bookingId: string | null) => {
      if (!userId || !bookingId) return false;
      const { data, error } = await supabase
        .from("bookings")
        .select("id")
        .eq("id", bookingId)
        .eq("user_id", userId)
        .eq("bay_id", bay.id)
        .in("status", ["confirmed", "pending"])
        .maybeSingle();
      return !error && !!data;
    };

    // Handle different actions
    switch (action) {
      case "heartbeat": {
        // Lightweight heartbeat - only upsert device status, no bookings fetch
        const { data: deviceData, error: upsertError } = await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bay.id,
            is_online: true,
            last_seen: new Date().toISOString(),
            app_version: appVersion,
          }, { onConflict: "bay_id" })
          .select("control_mode")
          .single();

        if (upsertError) {
          console.error(`[${VERSION}] Heartbeat upsert error:`, upsertError);
          return jsonResponse({ error: "Failed to update heartbeat" }, 500);
        }

        return jsonResponse({ 
          success: true, 
          timestamp: new Date().toISOString(),
          control_mode: deviceData?.control_mode || 'auto',
        });
      }

      case "log": {
        // Handle logging from bay controller apps
        const logs = Array.isArray(body?.logs) ? body.logs : (body ? [body] : []);
        
        if (logs.length === 0) {
          return jsonResponse({ error: "No logs provided" }, 400);
        }
        
        console.log(`[${VERSION}] Received ${logs.length} log entries from bay ${bayNumber}`);
        
        const logEntries = logs.map((log: Record<string, unknown>) => ({
          bay_number: bayNumber,
          event_type: log.event_type || 'unknown',
          event_level: log.event_level || 'info',
          message: log.message || '',
          details: { ...(log.details as Record<string, unknown> || {}), local_timestamp: log.local_timestamp || null },
          booking_id: log.booking_id || null,
          app_version: appVersion,
        }));
        
        const { error: insertError } = await supabase
          .from("bay_controller_logs")
          .insert(logEntries);
        
        if (insertError) {
          console.error(`[${VERSION}] Log insert error:`, insertError);
          return jsonResponse({ error: "Failed to store logs", details: insertError.message }, 500);
        }
        
        return jsonResponse({ success: true, count: logEntries.length });
      }

      case "get_user_setting": {
        const userId = typeof body?.user_id === "string" ? body.user_id : "";
        const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
        const file = typeof body?.file === "string" ? body.file : "";
        if (!userId || !SETTINGS_FILES.has(file)) return jsonResponse({ error: "bad_request" }, 400);
        if (!(await hasBookingAccess(userId, bookingId))) return jsonResponse({ error: "forbidden" }, 403);

        const path = `${userId}/${file}`;
        const { data, error } = await supabase.storage.from(SETTINGS_BUCKET).download(path);
        if (error || !data) return jsonResponse({ exists: false });

        const buf = new Uint8Array(await data.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return jsonResponse({ exists: true, base64: btoa(bin) });
      }

      case "save_user_setting": {
        const userId = typeof body?.user_id === "string" ? body.user_id : "";
        const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
        const file = typeof body?.file === "string" ? body.file : "";
        const base64 = typeof body?.base64 === "string" ? body.base64 : "";
        if (!userId || !SETTINGS_FILES.has(file) || !base64) return jsonResponse({ error: "bad_request" }, 400);

        // Access check: either the bookingId matches (normal path) OR the
        // user has ANY booking on this bay in the last 6 hours (covers the
        // case where files on disk belong to a user whose booking was
        // cancelled or ended before we uploaded).
        let access = bookingId ? await hasBookingAccess(userId, bookingId) : false;
        if (!access) {
          // Look back 36h using booking_date (covers overnight sessions and
          // next-morning uploads if a previous booking's snapshot lingered
          // on disk). Falls back to updated_at as a safety net.
          const sinceDate = new Date(Date.now() - 36 * 60 * 60 * 1000);
          const sinceDateStr = sinceDate.toISOString().slice(0, 10);
          const sinceIso = sinceDate.toISOString();
          const { data: recent } = await supabase
            .from("bookings")
            .select("id")
            .eq("user_id", userId)
            .eq("bay_id", bay.id)
            .or(`booking_date.gte.${sinceDateStr},updated_at.gte.${sinceIso}`)
            .limit(1)
            .maybeSingle();
          access = !!recent;
        }
        if (!access) return jsonResponse({ error: "forbidden", detail: "no_recent_booking_for_user_on_bay" }, 403);

        let bytes: Uint8Array;
        try { bytes = decodeBase64(base64); }
        catch { return jsonResponse({ error: "invalid_base64" }, 400); }

        // Baseline-hash comparison happens client-side in the Bay Controller;
        // any file that reaches this point is a genuine user-modified snapshot.

        const path = `${userId}/${file}`;
        const { error } = await supabase.storage.from(SETTINGS_BUCKET).upload(path, bytes, { upsert: true, contentType: "application/octet-stream" });
        if (error) return jsonResponse({ error: "upload_failed", detail: error.message }, 500);
        return jsonResponse({ ok: true, path });
      }

      case "ingest_range_session": {
        const userId = typeof body?.user_id === "string" ? body.user_id : "";
        const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
        const explicitBayId = typeof body?.bay_id === "string" ? body.bay_id : null;
        const csvBase64 = typeof body?.csv_base64 === "string" ? body.csv_base64 : "";
        const csvTextBody = typeof body?.csv_text === "string" ? body.csv_text : "";
        const filename = typeof body?.filename === "string" ? body.filename : null;
        if (!userId || (!csvBase64 && !csvTextBody)) return jsonResponse({ error: "missing_fields" }, 400);
        if (!(await hasBookingAccess(userId, bookingId))) return jsonResponse({ error: "forbidden" }, 403);

        let csvText: string;
        try {
          csvText = csvTextBody || new TextDecoder().decode(decodeBase64(csvBase64));
        } catch (e) {
          return jsonResponse({ error: "invalid_csv_base64", detail: String(e) }, 400);
        }

        const { headers, rows } = parseCsv(csvText);
        if (headers.length === 0 || rows.length === 0) return jsonResponse({ error: "empty_csv" }, 400);

        const colMap: (string | null)[] = headers.map((h) => FIELD_MAP[canonical(h)] ?? null);
        const filenameStamp = parseFilenameDate(filename);

        const { data: session, error: sessErr } = await supabase
          .from("range_sessions")
          .insert({
            user_id: userId,
            booking_id: bookingId,
            bay_id: explicitBayId ?? bay.id,
            shot_count: rows.length,
            source_filename: filename,
            ...(filenameStamp ? { session_date: filenameStamp.date, started_at: filenameStamp.iso } : {}),
          })
          .select("id")
          .single();
        if (sessErr || !session) return jsonResponse({ error: "session_insert_failed", detail: sessErr?.message }, 500);

        const sessionId = session.id;
        const NUMERIC_COLS = new Set([
          "ball_speed", "club_speed", "smash_factor", "launch_angle", "launch_direction",
          "spin_rate", "spin_axis", "back_spin", "side_spin", "carry", "total", "side_carry",
          "side_total", "apex_height", "descent_angle", "angle_of_attack", "club_path",
          "face_angle", "face_to_path",
        ]);

        const shotRows = rows.map((row, idx) => {
          const rec: Record<string, unknown> = { session_id: sessionId, shot_number: idx + 1 };
          const raw: Record<string, string> = {};
          row.forEach((val, i) => {
            const key = colMap[i];
            const hdr = headers[i];
            raw[hdr] = val;
            if (!key) return;
            if (key === "shot_number") { const n = num(val); if (n !== null) rec.shot_number = n; }
            else if (key === "shot_timestamp") { const t = Date.parse(val); if (!Number.isNaN(t)) rec.shot_timestamp = new Date(t).toISOString(); }
            else if (key === "club_type") { if (val) rec.club_type = val; }
            else if (NUMERIC_COLS.has(key)) { const n = num(val); if (n !== null) rec[key] = n; }
          });
          rec.raw = raw;
          return rec;
        });

        const CHUNK = 500;
        for (let i = 0; i < shotRows.length; i += CHUNK) {
          const { error } = await supabase.from("range_shots").insert(shotRows.slice(i, i + CHUNK));
          if (error) return jsonResponse({ error: "shot_insert_failed", detail: error.message, session_id: sessionId }, 500);
        }

        const stamps = shotRows.map((r) => r.shot_timestamp as string | undefined).filter(Boolean).sort();
        const started = stamps[0] ?? null;
        const ended = stamps[stamps.length - 1] ?? null;
        const durationMin = started && ended ? (new Date(ended).getTime() - new Date(started).getTime()) / 60000 : null;

        const csvPath = `${userId}/${sessionId}.csv`;
        const { error: upErr } = await supabase.storage.from(CSV_BUCKET).upload(csvPath, new Blob([csvText], { type: "text/csv" }), { upsert: true });
        const finalCsvPath = upErr ? null : csvPath;

        const updatePayload: Record<string, unknown> = { csv_path: finalCsvPath };
        if (started) updatePayload.started_at = started;
        if (ended) updatePayload.ended_at = ended;
        if (durationMin != null) updatePayload.duration_minutes = durationMin;
        await supabase.from("range_sessions").update(updatePayload).eq("id", sessionId);

        await supabase.from("bay_controller_logs").insert({
          bay_number: bayNumber,
          event_type: "automation_decision",
          event_level: "info",
          message: `[CSV] Ingested ${filename ?? "CSV"} for Swing Lab: shots=${shotRows.length}`,
          details: { session_id: sessionId, filename, shot_count: shotRows.length, local_timestamp: new Date().toISOString() },
          booking_id: bookingId,
          app_version: appVersion,
        });

        return jsonResponse({ ok: true, session_id: sessionId, shot_count: shotRows.length, started_at: started, ended_at: ended, csv_path: finalCsvPath });
      }

      case "should_record": {
        // Query: is this bay the pilot AND is the given booking a league tournament round?
        const bookingId = url.searchParams.get("booking_id") ?? (body as { booking_id?: string } | null)?.booking_id;
        if (!bookingId) return jsonResponse({ should_record: false, reason: "missing booking_id" });

        const { data: cfg } = await supabase
          .from("system_settings")
          .select("highlight_recording_enabled")
          .eq("id", "global")
          .single();

        if (!cfg?.highlight_recording_enabled) {
          return jsonResponse({ should_record: false, reason: "recording disabled" });
        }

        const { data: booking, error: bookingErr } = await supabase
          .from("bookings")
          .select("id, user_id, booking_date, start_time, end_time, notes")
          .eq("id", bookingId)
          .single();
        if (bookingErr) console.error("[should_record] booking lookup error:", bookingErr.message);
        if (!booking) return jsonResponse({ should_record: false, reason: "booking not found" });

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("first_name, last_name, sgt_user_id")
          .eq("user_id", booking.user_id)
          .maybeSingle();
        if (profErr) console.error("[should_record] profile lookup error:", profErr.message);

        const playerName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || "Player";
        const todayIso = new Date().toISOString().slice(0, 10);

        // 1) Local Comp takes ABSOLUTE priority. Many comp players also have an
        //    SGT profile; if SGT wins here the bay records an SGT-tagged session
        //    which the poller immediately stops (wrong_trigger_for_comp_booking),
        //    and the bay restarts it — producing repeated stub "Round 1" clips.
        const bookingIsComp = !!booking.notes?.includes("[COMP]");
        if (bookingIsComp) {
          const { data: compSettings } = await supabase
            .from("local_comp_settings")
            .select("hub_highlights_enabled")
            .limit(1)
            .maybeSingle();
          if (compSettings?.hub_highlights_enabled) {
            const { data: comp } = await supabase
              .from("local_competitions")
              .select("id, name, date, status")
              .eq("date", booking.booking_date)
              .in("status", ["upcoming", "active"])
              .maybeSingle();
            if (comp) {
              return jsonResponse({
                should_record: true,
                booking_id: bookingId,
                sgt_user_id: null,
                sgt_tournament_id: null,
                player_name: playerName,
                tournament_name: `Local Comp — ${comp.name}`,
                trigger_source: "local_comp",
                booking_end_time: `${booking.booking_date}T${booking.end_time}`,
              });
            }
          }
          // Tagged as comp but comp not enabled/found — never fall through to SGT.
          return jsonResponse({ should_record: false, reason: "comp booking but comp not active" });
        }

        // 2) SGT tournament round (hole-tagged).
        if (prof?.sgt_user_id) {
          const { data: tourney } = await supabase
            .from("sgt_tournaments")
            .select("tournament_id, name, start_date, end_date")
            .lte("start_date", todayIso)
            .gte("end_date", todayIso)
            .order("start_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (tourney) {
            return jsonResponse({
              should_record: true,
              booking_id: bookingId,
              sgt_user_id: prof.sgt_user_id,
              sgt_tournament_id: tourney.tournament_id,
              player_name: playerName,
              tournament_name: tourney.name,
              trigger_source: "sgt",
              booking_end_time: `${booking.booking_date}T${booking.end_time}`,
            });
          }
        }

        return jsonResponse({ should_record: false, reason: "no eligible tournament or comp" });
      }


      case "recording_start": {
        const b = body as { booking_id?: string; sgt_user_id?: string; sgt_tournament_id?: string; player_name?: string; tournament_name?: string; mkv_path?: string; started_at?: string; retention_days?: number; trigger_source?: string } | null;
        if (!b?.booking_id) return jsonResponse({ error: "booking_id required" }, 400);
        // Prefer the globally-configured retention from system_settings so admins
        // can change it in one place (Admin > SGT > Highlights). Falls back to
        // any override sent by the bay, then to a 14-day safe default.
        let retentionDays = b.retention_days ?? 14;
        const { data: settingsRow } = await supabase
          .from("system_settings")
          .select("highlight_retention_days")
          .eq("id", "global")
          .maybeSingle();
        if (settingsRow?.highlight_retention_days && settingsRow.highlight_retention_days > 0) {
          retentionDays = settingsRow.highlight_retention_days;
        }
        const retentionUntil = new Date(Date.now() + retentionDays * 86400_000).toISOString();
        const startedAt = b.started_at ?? new Date().toISOString();

        // Comp bookings must never produce an SGT-tagged session, even if an
        // older bay build sent SGT identifiers along with the start.
        const { data: startBooking } = await supabase
          .from("bookings")
          .select("notes")
          .eq("id", b.booking_id)
          .maybeSingle();
        const startIsComp = !!startBooking?.notes?.includes("[COMP]");
        const triggerSource = startIsComp
          ? "local_comp"
          : (b.trigger_source === "local_comp" ? "local_comp" : "sgt");
        const sgtUserId = triggerSource === "local_comp" ? null : (b.sgt_user_id ?? null);
        const sgtTournamentId = triggerSource === "local_comp" ? null : (b.sgt_tournament_id ?? null);

        // One active session per booking — if the bay re-asks after a stop we
        // don't want a second stub clip on the same round.
        const { data: existingActive } = await supabase
          .from("recording_sessions")
          .select("id")
          .eq("booking_id", b.booking_id)
          .in("status", ["recording", "stopping"])
          .maybeSingle();
        if (existingActive) {
          return jsonResponse({ ok: true, session_id: existingActive.id, reused: true });
        }
        if (triggerSource === "local_comp") {
          const { count: compCount } = await supabase
            .from("recording_sessions")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", b.booking_id)
            .eq("trigger_source", "local_comp");
          if ((compCount ?? 0) > 0) {
            return jsonResponse({ should_record: false, reason: "comp booking already recorded" });
          }
        }

        const { data, error } = await supabase.from("recording_sessions").insert({
          booking_id: b.booking_id,
          bay_number: bayNumber,
          sgt_user_id: sgtUserId,
          sgt_tournament_id: sgtTournamentId,
          player_name: b.player_name ?? null,
          tournament_name: b.tournament_name ?? null,
          trigger_source: triggerSource,
          ...(triggerSource === "local_comp" ? { round_number: 1 } : {}),

          mkv_path: b.mkv_path ?? null,
          started_at: startedAt,
          status: "recording",
          retention_until: retentionUntil,
        }).select("id").single();
        if (error) return jsonResponse({ error: error.message }, 500);


        // Snapshot already-scored holes so the poller ignores holes played
        // in a PREVIOUS session on the same tournament scorecard. Only holes
        // scored AFTER this session starts should trigger clips/chapters.
        // Pre-seeded rows are marked pre_existing=true so split/upload skips them.
        if (b.sgt_user_id && b.sgt_tournament_id) {
          try {
            const sgtBase = (Deno.env.get("SGT_CLUB_URL") ?? "").replace(/\/$/, "");
            const sgtKey = Deno.env.get("SGT_API_KEY") ?? "";
            if (sgtBase && sgtKey) {
              const url = `${sgtBase}/api/live-scorecard.php?apikey=${encodeURIComponent(sgtKey)}&playerId=${encodeURIComponent(b.sgt_user_id)}&tournamentId=${encodeURIComponent(b.sgt_tournament_id)}`;
              const res = await fetch(url);
              if (res.ok) {
                const card = await res.json();
                const preSeed: Array<{ recording_session_id: string; hole_number: number; par: number | null; score: number | null; hole_completed_at: string; status: string; pre_existing: boolean }> = [];
                const push = (n: number, par: number | null, score: number | null) => {
                  if (score != null && score !== 0) {
                    preSeed.push({ recording_session_id: data.id, hole_number: n, par, score, hole_completed_at: startedAt, status: "pre_existing", pre_existing: true });
                  }
                };
                if (Array.isArray(card?.holes)) {
                  for (const h of card.holes) {
                    const n = Number(h.hole ?? 0);
                    if (n >= 1 && n <= 18) push(n, h.par != null ? Number(h.par) : null, h.score != null && h.score !== "" ? Number(h.score) : null);
                  }
                } else if (card?.holeData && typeof card.holeData === "object") {
                  for (let n = 1; n <= 18; n++) {
                    const s = card.holeData[String(n)];
                    const p = card.parData?.[String(n)];
                    push(n, p != null ? Number(p) : null, s != null && s !== "" ? Number(s) : null);
                  }
                }
                if (preSeed.length > 0) {
                  await supabase.from("recording_holes").upsert(preSeed, { onConflict: "recording_session_id,hole_number" });
                  console.log(`[recording_start] Pre-seeded ${preSeed.length} already-scored holes for session ${data.id}`);
                }
              }
            }
          } catch (e) {
            console.error("[recording_start] pre-seed snapshot failed:", (e as Error).message);
          }
        }

        return jsonResponse({ ok: true, recording_session_id: data.id });
      }

      case "recording_stop": {
        const b = body as { recording_session_id?: string; ended_at?: string; file_size_bytes?: number; status?: string; error_message?: string; mkv_path?: string; stream_uid?: string } | null;
        if (!b?.recording_session_id) return jsonResponse({ error: "recording_session_id required" }, 400);

        const { data: stoppingSession } = await supabase
          .from("recording_sessions")
          .select("trigger_source")
          .eq("id", b.recording_session_id)
          .maybeSingle();

        // Run one final embed poll BEFORE flipping SGT sessions away from 'recording'
        // so the poller catches the final "(18)" → "F" transition and stamps hole 18.
        // Local comp sessions do not use SGT scorecards, and invoking the poller here
        // can briefly create/stop unrelated active comp sessions while the bay is
        // finalising a file.
        try {
          if (stoppingSession?.trigger_source !== "local_comp") {
            await supabase.functions.invoke("sgt-highlight-poller", { body: {} });
          }
        } catch (e) {
          console.error("[recording_stop] final poller invoke failed:", (e as Error).message);
        }

        const endedAt = b.ended_at ?? new Date().toISOString();
        const update: Record<string, unknown> = {
          ended_at: endedAt,
          file_size_bytes: b.file_size_bytes ?? null,
          status: b.status ?? "pending_split",
          error_message: b.error_message ?? null,
          updated_at: new Date().toISOString(),
        };
        if (b.mkv_path) update.mkv_path = b.mkv_path;
        // Direct-to-Cloudflare path: the bay already pushed the MP4 straight to
        // Stream via tus, so record the uid and let Cloudflare finish encoding.
        if (b.stream_uid) {
          update.stream_uid = b.stream_uid;
          update.stream_status = "processing";
          update.stream_created_at = new Date().toISOString();
        }
        const { error } = await supabase.from("recording_sessions").update(update).eq("id", b.recording_session_id);
        if (error) return jsonResponse({ error: error.message }, 500);

        // Direct-to-Cloudflare uploads never produce a Storage file, so the hole-0
        // placeholder row would sit at 'pending' forever. Mark it uploaded so any
        // consumer keyed off recording_holes sees the session as complete.
        if (b.stream_uid) {
          await supabase.from("recording_holes").upsert({
            recording_session_id: b.recording_session_id,
            hole_number: 0,
            status: "uploaded",
            updated_at: new Date().toISOString(),
          }, { onConflict: "recording_session_id,hole_number" });
        }


        // Fallback: if the poller couldn't confirm hole 18 (embed lag, player still
        // "on 18" at stop), stamp any un-stamped consecutive holes up to the highest
        // hole we've seen + 1 (i.e. the one they were actively playing when we stopped).
        const { data: holes } = await supabase
          .from("recording_holes")
          .select("hole_number, hole_completed_at, pre_existing")
          .eq("recording_session_id", b.recording_session_id)
          .order("hole_number", { ascending: true });
        if (holes && holes.length > 0) {
          const maxHole = Math.max(...holes.map((h) => h.hole_number));
          const nextHole = Math.min(maxHole + 1, 18);
          const hasNext = holes.some((h) => h.hole_number === nextHole);
          // Only stamp the "in-progress" hole if the previous one is completed
          // (i.e. they definitely started nextHole) and it isn't already recorded.
          const prevCompleted = holes.some((h) => h.hole_number === maxHole && (h.hole_completed_at || h.pre_existing));
          if (!hasNext && prevCompleted && nextHole > maxHole) {
            await supabase.from("recording_holes").upsert({
              recording_session_id: b.recording_session_id,
              hole_number: nextHole,
              hole_completed_at: endedAt,
              pre_existing: false,
              status: "pending",
              updated_at: new Date().toISOString(),
            }, { onConflict: "recording_session_id,hole_number" });
            console.log(`[recording_stop] stamped fallback hole ${nextHole} for session ${b.recording_session_id}`);
          }
        }

        // Auto-kick Cloudflare Stream upload so highlights are ready without
        // anyone opening the Hub. stream-upload is idempotent — safe to invoke.
        // Skipped when the bay uploaded direct-to-Stream (stream_uid present).
        if (!b.stream_uid && (b.mkv_path || b.status === "pending_split")) {
          try {
            const secret = (Deno.env.get("SYNC_SECRET") ?? "").trim();
            void supabase.functions.invoke("stream-upload", {
              body: { recording_session_id: b.recording_session_id },
              headers: secret ? { "x-internal-secret": secret } : undefined,
            }).catch((e) => console.error("[recording_stop] stream-upload invoke failed:", (e as Error).message));
          } catch (e) {
            console.error("[recording_stop] stream-upload dispatch failed:", (e as Error).message);
          }
        }

        return jsonResponse({ ok: true });
      }


      case "recording_upload_url": {
        const b = body as { recording_session_id?: string; hole_number?: number; filename?: string } | null;
        if (!b?.recording_session_id || b.hole_number == null) return jsonResponse({ error: "recording_session_id + hole_number required" }, 400);
        const safeName = (b.filename ?? `hole-${b.hole_number}.mkv`).replace(/[^a-zA-Z0-9._-]/g, "_");
        const objectPath = `${b.recording_session_id}/${safeName}`;
        const { data, error } = await supabase.storage.from(HIGHLIGHTS_BUCKET).createSignedUploadUrl(objectPath);
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true, signed_url: data.signedUrl, path: objectPath, token: data.token });
      }

      // Mints a one-time Cloudflare Stream tus upload URL so the bay can push
      // the MP4 straight to Cloudflare — no 2 GiB storage cap, no re-upload hop.
      case "recording_stream_upload_url": {
        const b = body as { recording_session_id?: string; size_bytes?: number; name?: string } | null;
        if (!b?.recording_session_id || !b.size_bytes) return jsonResponse({ error: "recording_session_id + size_bytes required" }, 400);

        const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
        const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
        if (!accountId || !token) return jsonResponse({ error: "Cloudflare Stream is not configured" }, 500);

        const { data: sess } = await supabase
          .from("recording_sessions")
          .select("player_name, tournament_name, bay_number, started_at, round_number")
          .eq("id", b.recording_session_id)
          .maybeSingle();

        const label = [
          sess?.player_name ?? "Player",
          sess?.tournament_name ?? "",
          sess?.round_number ? `R${sess.round_number}` : "",
          `Bay ${sess?.bay_number ?? "?"}`,
          (sess?.started_at ?? new Date().toISOString()).slice(0, 10),
        ].filter(Boolean).join(" · ");

        const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
        const metadata = [
          `name ${b64(label)}`,
          `maxdurationseconds ${b64("21600")}`,
        ].join(",");

        const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Length": String(b.size_bytes),
            "Upload-Metadata": metadata,
          },
        });

        if (!cfRes.ok) {
          const txt = await cfRes.text().catch(() => "");
          return jsonResponse({ error: `Cloudflare tus create failed (${cfRes.status}): ${txt.slice(0, 300)}` }, 502);
        }

        const uploadUrl = cfRes.headers.get("Location");
        const uid = cfRes.headers.get("stream-media-id");
        if (!uploadUrl || !uid) return jsonResponse({ error: "Cloudflare did not return an upload URL" }, 502);

        await supabase.from("recording_sessions").update({
          stream_uid: uid,
          stream_status: "uploading",
          // Persist the declared Upload-Length. If a tus upload later fails on the
          // final chunk, comparing this to the on-disk size proves whether the file
          // grew after the URL was minted.
          file_size_bytes: b.size_bytes,
          stream_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", b.recording_session_id);


        return jsonResponse({ ok: true, upload_url: uploadUrl, stream_uid: uid });
      }


      case "recording_hole": {
        const b = body as { recording_session_id?: string; hole_number?: number; par?: number; score?: number; clip_start_seconds?: number; clip_end_seconds?: number; storage_path?: string; shot_timeline?: unknown[] } | null;
        if (!b?.recording_session_id || b.hole_number == null) return jsonResponse({ error: "recording_session_id + hole_number required" }, 400);
        const { error } = await supabase.from("recording_holes").upsert({
          recording_session_id: b.recording_session_id,
          hole_number: b.hole_number,
          par: b.par ?? null,
          score: b.score ?? null,
          clip_start_seconds: b.clip_start_seconds ?? null,
          clip_end_seconds: b.clip_end_seconds ?? null,
          storage_path: b.storage_path ?? null,
          shot_timeline: b.shot_timeline ?? [],
          status: b.storage_path ? "uploaded" : "pending",
          updated_at: new Date().toISOString(),
        }, { onConflict: "recording_session_id,hole_number" });
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ ok: true });
      }

      case "bookings":
      default: {
        // Update device status and get current control_mode
        const { data: deviceData } = await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bay.id,
            is_online: true,
            last_seen: new Date().toISOString(),
            app_version: appVersion,
          }, { onConflict: "bay_id" })
          .select("control_mode")
          .single();

        // Get timezone from system settings
        const { data: settings } = await supabase
          .from("system_settings")
          .select("timezone")
          .eq("id", "global")
          .single();
        
        const timezone = settings?.timezone || 'Australia/Sydney';

        // Get current date and time in configured timezone
        const now = new Date();
        const tzOptions = { timeZone: timezone };
        const localDateStr = now.toLocaleDateString('en-CA', tzOptions); // "YYYY-MM-DD"
        const localTimeStr = now.toLocaleTimeString('en-GB', { ...tzOptions, hour12: false }); // "HH:MM:SS"
        
        console.log(`[${VERSION}] Server UTC time: ${now.toISOString()}, Timezone: ${timezone}, Local date: ${localDateStr}, Local time: ${localTimeStr}`);

        // Fetch bookings for this bay from today onwards
        // Include both confirmed and pending bookings (exclude cancelled only)
        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select(`
            id,
            booking_date,
            start_time,
            end_time,
            duration_hours,
            player_count,
            status,
            user_id
          `)
          .eq("bay_id", bay.id)
          .in("status", ["confirmed", "pending"])
          .gte("booking_date", localDateStr)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true });

        // Filter out past bookings for today (only keep bookings that haven't ended yet)
        const filteredBookings = (bookings || []).filter((booking: Record<string, unknown>) => {
          if ((booking.booking_date as string) > localDateStr) {
            // Future date - always include
            return true;
          }
          // Today's date - only include if booking hasn't ended yet
          return (booking.end_time as string) > localTimeStr;
        });

        if (bookingsError) {
          console.error(`[${VERSION}] Bookings fetch error:`, bookingsError);
          return jsonResponse({ error: "Failed to fetch bookings" }, 500);
        }

        // Fetch customer names and SGT info for each booking
        const userIds = [...new Set(filteredBookings.map((b: Record<string, unknown>) => b.user_id as string))];
        let profilesMap: Record<string, { first_name: string; last_name: string; sgt_user_id: number | null }> = {};
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, sgt_user_id")
            .in("user_id", userIds);
          
          if (profiles) {
            profiles.forEach((p: Record<string, unknown>) => {
              profilesMap[p.user_id as string] = { 
                first_name: p.first_name as string, 
                last_name: p.last_name as string,
                sgt_user_id: p.sgt_user_id as number | null
              };
            });
          }
        }

        // Fetch SGT member info for users with sgt_user_id
        const sgtUserIds = Object.values(profilesMap)
          .filter(p => p.sgt_user_id !== null)
          .map(p => p.sgt_user_id);
        
        let sgtMembersMap: Record<number, { user_name: string; user_game_id: string | null }> = {};
        if (sgtUserIds.length > 0) {
          const { data: sgtMembers } = await supabase
            .from("sgt_members")
            .select("user_id, user_name, user_game_id")
            .in("user_id", sgtUserIds);
          
          if (sgtMembers) {
            sgtMembers.forEach((m: Record<string, unknown>) => {
              sgtMembersMap[m.user_id as number] = { 
                user_name: m.user_name as string, 
                user_game_id: m.user_game_id as string | null 
              };
            });
          }
        }

        // Transform bookings to include customer_name and SGT info
        const bookingsWithNames = filteredBookings.map((booking: Record<string, unknown>) => {
          const profile = profilesMap[booking.user_id as string];
          const sgtMember = profile?.sgt_user_id ? sgtMembersMap[profile.sgt_user_id] : null;
          return {
            id: booking.id,
            booking_date: booking.booking_date,
            start_time: booking.start_time,
            end_time: booking.end_time,
            duration_hours: booking.duration_hours,
            player_count: booking.player_count,
            status: booking.status,
            user_id: booking.user_id,
            customer_name: profile 
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
              : 'Unknown',
            sgt_user_id: profile?.sgt_user_id || null,
            sgt_username: sgtMember?.user_name || null,
            sgt_game_id: sgtMember?.user_game_id || null,
          };
        });

        console.log(`[${VERSION}] Returning ${filteredBookings.length} bookings for bay ${bayNumber} (filtered from ${bookings?.length || 0})`);

        return jsonResponse({
          bay: {
            id: bay.id,
            number: bayNumber,
            name: bay.name,
          },
          bookings: bookingsWithNames,
          control_mode: deviceData?.control_mode || 'auto',
          server_time: new Date().toISOString(),
        });
      }
    }
  } catch (error: unknown) {
    console.error(`[${VERSION}] Bay Controller API error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
