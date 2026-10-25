// First Session Free is retired. Imported accounts must never receive this promo.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleRequest(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // All callers, including scheduled and forced requests, are harmless no-ops.
  return new Response(JSON.stringify({ success: true, disabled: true, processed: 0 }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handleRequest);
