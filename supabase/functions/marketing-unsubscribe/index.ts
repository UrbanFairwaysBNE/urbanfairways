import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getTenant } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UnsubscribeRequest {
  email: string;
  token?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tenant = await getTenant();
    const { email, token }: UnsubscribeRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[marketing-unsubscribe] Processing unsubscribe for: ${email}`);

    // Initialize Supabase admin client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify token matches email hash (simple security measure)
    const expectedToken = await generateToken(email, tenant.venue_name);
    if (token && token !== expectedToken) {
      console.warn(`[marketing-unsubscribe] Invalid token for ${email}`);
      // Still allow unsubscribe but log the mismatch
    }

    // Update profile to opt out of marketing
    const { data, error } = await supabase
      .from("profiles")
      .update({ marketing_opt_out: true })
      .eq("email", email.toLowerCase())
      .select("id, email")
      .maybeSingle();

    if (error) {
      console.error(`[marketing-unsubscribe] Database error:`, error);
      throw error;
    }

    if (!data) {
      console.log(`[marketing-unsubscribe] Email not found: ${email}`);
      // Return success anyway to prevent email enumeration
      return new Response(
        JSON.stringify({ success: true, message: "Unsubscribed successfully" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Log the unsubscribe event
    await supabase.from("marketing_unsubscribes").insert({
      profile_id: data.id,
      email: email.toLowerCase(),
      reason: "user_unsubscribed",
    });

    console.log(`[marketing-unsubscribe] Successfully unsubscribed: ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Unsubscribed successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[marketing-unsubscribe] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

// Simple token generator for URL verification
async function generateToken(email: string, venueName: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase() + `${venueName.toLowerCase().replace(/\s+/g, "-")}-unsubscribe-salt`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}
