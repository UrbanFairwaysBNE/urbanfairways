// Uploads a league-highlights MKV from Supabase Storage to Cloudflare Stream.
// Uses Cloudflare's copy-from-URL endpoint so the file is pulled directly,
// avoiding Edge Function memory/timeout limits for large MKVs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getTenant } from "../_shared/tenant.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface SessionRow {
  id: string;
  mkv_path: string | null;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  stream_uid: string | null;
  stream_status: string | null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cloudflareError(json: any, fallback: string) {
  const first = json?.errors?.[0];
  if (!first) return fallback;
  return `Cloudflare Stream error ${first.code}: ${first.message}`;
}

async function getStreamVideo(accountId: string, token: string, uid: string) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch {}

    if (!res.ok) {
      return {
        ok: false,
        video: null,
        error: `${cloudflareError(json, `Cloudflare status check failed (${res.status})`)}${res.status === 401 ? " — check the Account ID/API token and Stream edit permission." : ""}`,
        statusCode: res.status,
      };
    }

    return { ok: true, video: json.result ?? null, error: null, statusCode: res.status };
  } catch (err) {
    return {
      ok: false,
      video: null,
      error: err instanceof Error ? err.message : "Cloudflare status check timed out",
      statusCode: 0,
    };
  }
}

function getCloudflareCredentials() {
  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  return { accountId, token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tenant = await getTenant();

  // Internal callers (e.g. bay-controller-api recording_stop) may bypass user
  // auth by presenting the shared SYNC_SECRET. Everything else must be an admin.
  const internalSecret = (Deno.env.get("SYNC_SECRET") ?? "").trim();
  const providedSecret = (req.headers.get("x-internal-secret") ?? "").trim();
  const isInternal = internalSecret.length > 0 && providedSecret === internalSecret;

  if (!isInternal) {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes } = await authClient.auth.getUser();
    if (!userRes?.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    if (!isAdmin) {
      return jsonResponse({ error: "forbidden" }, 403);
    }
  }


  const { recording_session_id } = await req.json();
  if (!recording_session_id) {
    return jsonResponse({ error: "recording_session_id required" }, 400);
  }

  const { data: session, error: sessErr } = await admin
    .from("recording_sessions")
    .select("id, mkv_path, player_name, tournament_name, bay_number, started_at, stream_uid, stream_status")
    .eq("id", recording_session_id)
    .single();

  if (sessErr || !session) {
    return jsonResponse({ error: sessErr?.message ?? "session not found" }, 404);
  }

  const sess = session as SessionRow;

  // NOTE: mkv_path is only required for the legacy "copy from storage" path.
  // Sessions uploaded directly from the Bay Controller via tus have a
  // stream_uid but no storage file, so the status refresh below must run first.


  const { accountId, token } = getCloudflareCredentials();
  if (!accountId || !token) {
    return jsonResponse({ error: "Cloudflare Stream credentials are not configured" }, 500);
  }
  const fallbackPlaybackUrl = (uid: string) => `https://customer-${accountId}.cloudflarestream.com/${uid}/manifest/video.m3u8`;

  // If we already have a UID, check current status first.
  if (sess.stream_uid) {
    const existing = await getStreamVideo(accountId, token, sess.stream_uid);
    if (!existing.ok) {
      const msg = existing.error ?? "Cloudflare status check failed";
      console.error("[stream-upload] CF status failed", { uid: sess.stream_uid, statusCode: existing.statusCode, error: msg });
      await admin.from("recording_sessions").update({
        stream_status: "status_failed",
        stream_error: msg,
      }).eq("id", sess.id);
      return jsonResponse({ stream_uid: sess.stream_uid, status: "status_failed", error: msg, playback_url: null });
    }

    const video = existing.video;
    if (video) {
      const state = video.status?.state ?? "inprogress";
      const failed = state === "error" || state === "failed";
      const normalizedState = state === "ready" ? "ready" : failed ? "failed" : state;
      const streamError = video.status?.errorReasonText ?? video.status?.errorReasonCode ?? null;
      await admin.from("recording_sessions").update({
        stream_status: normalizedState,
        stream_error: streamError,
        stream_created_at: video.created ?? null,
      }).eq("id", sess.id);
      if (state === "ready") {
        return jsonResponse({ stream_uid: sess.stream_uid, status: "ready", playback_url: video.playback?.hls ?? fallbackPlaybackUrl(sess.stream_uid) });
      }
      if (failed) {
        return jsonResponse({ stream_uid: sess.stream_uid, status: "failed", error: streamError ?? "Cloudflare Stream processing failed", playback_url: null });
      }
      return jsonResponse({ stream_uid: sess.stream_uid, status: normalizedState, playback_url: null });
    }
  }

  if (!sess.mkv_path) {
    return jsonResponse({ error: "session has no mkv_path and no Cloudflare video to refresh" }, 400);
  }

  // Mint a signed URL for Cloudflare to pull the file.
  const { data: signed, error: signedErr } = await admin.storage.from("league-highlights").createSignedUrl(sess.mkv_path, 7200);
  if (signedErr || !signed?.signedUrl) {
    return jsonResponse({ error: signedErr?.message ?? "failed to create signed url" }, 500);
  }

  // Start a fresh copy upload.
  const title = `${sess.player_name ?? "Unknown"} — Bay ${sess.bay_number}${sess.tournament_name ? ` — ${sess.tournament_name}` : ""}`;
  console.log("[stream-upload] Requesting CF copy", { accountId: accountId?.slice(0, 6) + "…", hasToken: !!token, title, signedUrlHost: new URL(signed.signedUrl).host });

  const copyRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: signed.signedUrl,
      meta: { name: title },
      requireSignedURLs: false,
      allowedOrigins: [tenant.booking_domain, `*.${tenant.booking_domain}`, "*.lovable.app"],
    }),
  });

  const copyText = await copyRes.text();
  let copyJson: any = {};
  try { copyJson = JSON.parse(copyText); } catch {}
  if (!copyRes.ok) {
    console.error("[stream-upload] CF copy failed", copyRes.status, copyText);
    const cfError = copyJson.errors?.[0];
    const msg = cfError
      ? `Cloudflare Stream error ${cfError.code}: ${cfError.message}${copyRes.status === 401 ? " — check the Account ID/API token and Stream edit permission." : ""}`
      : `Cloudflare copy failed (${copyRes.status})`;
    await admin.from("recording_sessions").update({
      stream_status: "failed",
      stream_error: msg,
    }).eq("id", sess.id);
    return jsonResponse({ stream_uid: null, status: "failed", error: msg, cf_status: copyRes.status, cf_body: copyText.slice(0, 500) });
  }

  const uid = copyJson.result?.uid;
  if (!uid) {
    return jsonResponse({ error: "Cloudflare did not return a stream uid" }, 502);
  }

  await admin.from("recording_sessions").update({
    stream_uid: uid,
    stream_status: "inprogress",
    stream_created_at: new Date().toISOString(),
  }).eq("id", sess.id);

  return jsonResponse({ stream_uid: uid, status: "inprogress", playback_url: null });
});
