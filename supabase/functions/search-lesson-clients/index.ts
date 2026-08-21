import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Coach-only customer lookup used by the "Book a Lesson" flow.
 * Coaches cannot read other profiles under RLS, so this function verifies the
 * caller is flagged `is_coach` and returns a minimal, capped result set.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("is_coach")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!me?.is_coach && !isAdmin) {
      return new Response(JSON.stringify({ error: "Coaches only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const raw = typeof body.query === "string" ? body.query.trim() : "";
    if (raw.length < 2) {
      return new Response(JSON.stringify({ clients: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Split into tokens so multi-word queries like "sam m" match first name in
    // one column and last name in another.
    const tokens = raw
      .replace(/[,()*%]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((t) => t.slice(0, 40));

    let query = supabaseAdmin
      .from("profiles")
      .select("user_id, first_name, last_name, email, phone")
      .neq("user_id", user.id);

    // Every token must match somewhere (first name, last name, email or phone)
    for (const t of tokens) {
      query = query.or(
        `first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`,
      );
    }

    const { data, error } = await query.order("last_name").limit(50);

    if (error) throw error;

    // Rank exact "first last" matches first
    const full = tokens.join(" ");
    const ranked = [...(data ?? [])]
      .sort((a, b) => {
        const af = `${a.first_name ?? ""} ${a.last_name ?? ""}`.toLowerCase();
        const bf = `${b.first_name ?? ""} ${b.last_name ?? ""}`.toLowerCase();
        return (af.includes(full) ? 0 : 1) - (bf.includes(full) ? 0 : 1);
      })
      .slice(0, 15);

    return new Response(JSON.stringify({ clients: ranked }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
