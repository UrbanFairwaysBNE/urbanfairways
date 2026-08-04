// Generates a social-ready written recap of a weekly 2-Man Ambrose competition.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const norm = (s: string) => (s || "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const tenant = await getTenant();

  try {
    const { competition_id } = await req.json();
    if (!competition_id) {
      return new Response(JSON.stringify({ error: "competition_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: comp } = await admin
      .from("local_competitions")
      .select("*")
      .eq("id", competition_id)
      .maybeSingle();

    if (!comp) {
      return new Response(JSON.stringify({ error: "Competition not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: teams, error } = await admin
      .from("local_comp_teams")
      .select("*")
      .eq("competition_id", competition_id);
    if (error) throw error;

    const scored = (teams || []).filter((t) => t.net_score != null);
    if (scored.length === 0) {
      return new Response(JSON.stringify({ error: "No scores entered for this competition yet." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prior Ambrose Wednesdays (for form comparison)
    const { data: priorComps } = await admin
      .from("local_competitions")
      .select("id, name, date")
      .lt("date", comp.date)
      .in("status", ["active", "completed"])
      .order("date", { ascending: false })
      .limit(6);

    const priorIds = (priorComps || []).map((c) => c.id);
    let priorTeams: any[] = [];
    if (priorIds.length) {
      const { data } = await admin
        .from("local_comp_teams")
        .select("competition_id, team_name, player1_name, player2_name, combined_handicap, gross_score, net_score, position")
        .in("competition_id", priorIds);
      priorTeams = data || [];
    }

    const priorCompById = new Map((priorComps || []).map((c) => [c.id, c]));

    // Per-player history across previous comps
    const playerHistory = new Map<string, { name: string; appearances: number; nets: number[]; best_position: number | null; wins: number }>();
    for (const t of priorTeams) {
      for (const name of [t.player1_name, t.player2_name]) {
        if (!name) continue;
        const key = norm(name);
        const rec = playerHistory.get(key) || { name, appearances: 0, nets: [], best_position: null, wins: 0 };
        rec.appearances += 1;
        if (t.net_score != null) rec.nets.push(t.net_score);
        if (t.position != null) {
          rec.best_position = rec.best_position == null ? t.position : Math.min(rec.best_position, t.position);
          if (t.position === 1) rec.wins += 1;
        }
        playerHistory.set(key, rec);
      }
    }

    const sorted = [...scored].sort((a, b) => {
      if (a.position && b.position) return a.position - b.position;
      if (a.net_score === b.net_score) return (a.gross_score ?? 999) - (b.gross_score ?? 999);
      return (a.net_score as number) - (b.net_score as number);
    });

    const leaderboard = sorted.map((t, idx) => {
      const players = [t.player1_name, t.player2_name].map((name, i) => {
        const h = playerHistory.get(norm(name));
        const avgPriorNet = h && h.nets.length ? +(h.nets.reduce((a, b) => a + b, 0) / h.nets.length).toFixed(1) : null;
        return {
          name,
          handicap: i === 0 ? t.player1_handicap : t.player2_handicap,
          previous_ambrose_appearances: h?.appearances ?? 0,
          previous_wins: h?.wins ?? 0,
          best_previous_position: h?.best_position ?? null,
          avg_previous_team_net: avgPriorNet,
        };
      });
      return {
        position: t.position ?? idx + 1,
        team_name: t.team_name,
        players,
        combined_handicap: t.combined_handicap,
        gross_score: t.gross_score,
        net_score: t.net_score,
      };
    });

    const nets = sorted.map((t) => t.net_score as number);
    const winner = leaderboard[0];
    const runnerUp = leaderboard[1] ?? null;

    const payload = {
      competition: {
        name: comp.name,
        date: comp.date,
        format: "2-Man Ambrose (combined handicap, net score decides)",
        course: comp.course_name,
        tees: comp.tees,
        pins: comp.pins,
        wind: comp.wind,
        green_speed: comp.green_speed,
        green_firmness: comp.green_firmness,
        fairway_firmness: comp.fairway_firmness,
        entry_fee: comp.entry_fee,
      },
      teams_with_scores: scored.length,
      teams_registered: (teams || []).length,
      leaderboard,
      margin_of_victory: runnerUp && winner ? +((runnerUp.net_score as number) - (winner.net_score as number)).toFixed(1) : null,
      lowest_gross: sorted
        .filter((t) => t.gross_score != null)
        .sort((a, b) => (a.gross_score as number) - (b.gross_score as number))
        .slice(0, 3)
        .map((t) => ({ team_name: t.team_name, players: [t.player1_name, t.player2_name], gross_score: t.gross_score })),
      field_average_net: nets.length ? +(nets.reduce((a, b) => a + b, 0) / nets.length).toFixed(1) : null,
      previous_weeks: (priorComps || []).slice(0, 3).map((c) => {
        const winnerTeam = priorTeams
          .filter((t) => t.competition_id === c.id && t.net_score != null)
          .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.net_score - b.net_score)[0];
        return {
          name: priorCompById.get(c.id)?.name,
          date: c.date,
          winner: winnerTeam
            ? { team_name: winnerTeam.team_name, players: [winnerTeam.player1_name, winnerTeam.player2_name], net_score: winnerTeam.net_score }
            : null,
        };
      }),
    };

    const systemPrompt = `You are the resident writer for ${tenant.venue_name}'s weekly 2-Man Ambrose competition ("Ambrose Wednesdays"). You write the weekly wrap that gets posted straight to social media.

Voice: plain, understated, factual. Write like a club captain typing up the week's results — dry, matter-of-fact, occasionally a small wry aside. Never breathless. Australian English.

Hard rules:
- No hype language, no sports-cliché metaphors, no purple prose. Banned outright: "chasing shadows", "scorching", "on fire", "statement round", "clinic", "dominant display", "held their nerve", "the field could only watch", "carnage", "fireworks", "cruised", "stormed", "surge", "blistering", "commanding", and anything of that flavour. If a phrase sounds like TV commentary, cut it.
- Describe what happened using the numbers, not adjectives.
- At most one light joke or wry line in the whole piece. Zero is fine.
- Never mention AI, data, algorithms, "analysis", "insights", or that you were given statistics.
- No emoji, no hashtags, no corporate filler, no rhetorical question openers.
- Only state facts present in the supplied numbers. Never invent shots, weather, quotes or drama that isn't in the data.
- It is a 2-man Ambrose off combined handicap: the result is decided on net score (lower wins). Refer to teams by team name and name both players.
- 180–280 words. Plain text with short paragraphs, no markdown headings, no bullet lists.

Structure loosely: open on the winning team, their players and net score, then the margin over the runners-up, mention notable combined handicaps or the lowest gross of the day, note anyone whose result was a step up on their previous Ambrose Wednesdays form (or a repeat winner), and finish with a plain line about next Wednesday.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        reasoning_effort: "none",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Write this week's Ambrose wrap. Numbers below (net score: lower wins).\n\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway ${res.status}: ${t}`);
    }

    const json = await res.json();
    const commentary = json.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ commentary, summary: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("local-comp-commentary error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
