import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getClubUrl, getSgtConfig } from "../_shared/sgt-config.ts";
import { getTenant, TenantConfig } from "../_shared/tenant.ts";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Build branded email for new member notification with onboarding link
function buildNewMemberBody(data: { username: string; email: string; sgtUserId: number; registeredAt: string; onboardingUrl: string; typicalScore?: string }, tenant: TenantConfig): string {
  const registrationDate = new Date(data.registeredAt).toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    dateStyle: "full",
    timeStyle: "short",
  });

  return `
              <p style="margin:0 0 14px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                A new member has joined the ${tenant.venue_name} League via the app.
              </p>
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.6; color:#B5772A; text-align:center; font-weight:600;">
                ⚠️ Action Required: Set their handicap to complete onboarding
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #B5772A;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134;">
                    <h3 style="margin:0 0 16px 0; font-family:Archivo, Impact, Arial Black, sans-serif; color:#2F3134;">Member Details</h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>Username:</strong></td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">${data.username}</td></tr>
                      <tr><td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>Email:</strong></td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;"><a href="mailto:${data.email}" style="color:#2F3134;">${data.email}</a></td></tr>
                      <tr><td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>SGT User ID:</strong></td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">${data.sgtUserId}</td></tr>
                      <tr><td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>Registered:</strong></td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">${registrationDate}</td></tr>
                      <tr><td style="padding:8px 0;"><strong>Typical 18-hole score:</strong></td><td style="padding:8px 0; text-align:right;">${data.typicalScore ? data.typicalScore : '<em style="color:#999;">Not provided</em>'}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:13px; line-height:1.6; color:#666; text-align:center;">
                The member will be held in a "pending" state until you set their handicap.<br/>
                Once onboarded, they'll be automatically registered for all active tours and tournaments.
              </p>
  `;
}

// Cache for API key
let cachedApiKey: { key: string; expiresAt: Date } | null = null;

// Try to refresh an existing API key before it expires
async function refreshApiKey(existingKey: string, clubUrl: string): Promise<{ key: string; expiresAt: Date } | null> {
  const formData = new URLSearchParams();
  formData.append("api-key", existingKey);

  console.log(`[SGT-REGISTER] Attempting to refresh API key...`);
  
  try {
    const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.log(`[SGT-REGISTER] Refresh failed with status ${response.status}`);
      return null;
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log(`[SGT-REGISTER] Refresh returned non-JSON: ${responseText.substring(0, 100)}`);
      return null;
    }

    if (!data.success || !data.key) {
      console.log(`[SGT-REGISTER] Refresh unsuccessful:`, data);
      return null;
    }

    console.log(`[SGT-REGISTER] API key refreshed successfully`);
    return {
      key: data.key,
      expiresAt: new Date(Date.now() + (data.expires * 1000)),
    };
  } catch (e) {
    console.error(`[SGT-REGISTER] Refresh error:`, e);
    return null;
  }
}

// Create a new API key using username/password
async function createNewApiKey(supabase: any, clubUrl: string): Promise<{ key: string; expiresAt: Date }> {
  const sgtConfig = await getSgtConfig();
  const username = sgtConfig.username;
  const password = sgtConfig.password;

  if (!username || !password || !clubUrl) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  console.log(`[SGT-REGISTER] Creating new API key...`);
  
  const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error(`[SGT-REGISTER] API key create failed: ${response.status}, body: ${responseText.substring(0, 200)}`);
    throw new Error(`SGT API temporarily unavailable. Please try again in a few minutes.`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error(`[SGT-REGISTER] Invalid JSON response: ${responseText.substring(0, 200)}`);
    throw new Error("SGT API returned invalid response. Please try again in a few minutes.");
  }
  
  if (!data.success || !data.key) {
    console.error(`[SGT-REGISTER] API key auth failed:`, data);
    throw new Error("Failed to authenticate with SGT API");
  }

  const expiresAt = new Date(Date.now() + (data.expires * 1000));
  console.log(`[SGT-REGISTER] New API key created successfully`);
  
  return { key: data.key, expiresAt };
}

async function getApiKey(supabase: any, clubUrl: string): Promise<string> {
  const BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer

  // Check if cached key is still valid
  if (cachedApiKey && cachedApiKey.expiresAt.getTime() > Date.now() + BUFFER_MS) {
    return cachedApiKey.key;
  }

  // Try to get from database first
  const { data: config } = await supabase
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (config?.api_key) {
    const expiresAt = new Date(config.expires_at);
    const timeUntilExpiry = expiresAt.getTime() - Date.now();

    // If key is still valid with buffer, use it
    if (timeUntilExpiry > BUFFER_MS) {
      cachedApiKey = { key: config.api_key, expiresAt };
      return config.api_key;
    }

    // Key exists but expiring soon - try to REFRESH it first
    console.log(`[SGT-REGISTER] Key expiring in ${Math.round(timeUntilExpiry / 1000)}s, attempting refresh...`);
    const refreshed = await refreshApiKey(config.api_key, clubUrl);
    
    if (refreshed) {
      // Store refreshed key in DB
      await supabase.from("sgt_api_config").upsert({
        api_key: refreshed.key,
        expires_at: refreshed.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      });
      cachedApiKey = refreshed;
      return refreshed.key;
    }
    
    console.log(`[SGT-REGISTER] Refresh failed, creating new key...`);
  }

  // No valid key or refresh failed - create new one
  const newKey = await createNewApiKey(supabase, clubUrl);

  // Store in database
  await supabase.from("sgt_api_config").upsert({
    api_key: newKey.key,
    expires_at: newKey.expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  });

  cachedApiKey = newKey;
  return newKey.key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clubUrl = await getClubUrl();

  const authHeader = req.headers.get("Authorization");
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("[SGT-REGISTER] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, username, password, typicalScore } = await req.json();
    console.log(`[SGT-REGISTER] Action: ${action}, User: ${user.id}`);

    // Track the API key actually used for downstream calls in this request.
    // (Important when we have to force-create a fresh key and retry.)
    let activeApiKey = await getApiKey(adminClient, clubUrl);

     if (action === "check-username") {
      // Check if username is available by checking existing members
       const membersResponse = await fetch(
         `${SGT_BASE_URL}/${clubUrl}/members/list?api-key=${encodeURIComponent(activeApiKey)}`,
        { method: "GET" }
      );

      if (!membersResponse.ok) {
        const body = await membersResponse.text();
        console.error(`[SGT-REGISTER] members/list failed: ${membersResponse.status} ${body.substring(0, 200)}`);
        throw new Error("Failed to fetch members list");
      }

      const membersData = await membersResponse.json();
      const existingUsernames = (membersData.members || []).map((m: any) => 
        m.user_name.toLowerCase()
      );

      const isAvailable = !existingUsernames.includes(username.toLowerCase());

      return new Response(
        JSON.stringify({ available: isAvailable }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

     if (action === "register") {
      if (!username || !password) {
        return new Response(
          JSON.stringify({ error: "Username and password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate username format (2-64 alphanumeric or underscore)
      if (!/^[a-zA-Z0-9_]{2,64}$/.test(username)) {
        return new Response(
          JSON.stringify({ error: "Username must be 2-64 alphanumeric characters or underscores" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate password (min 6 chars)
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Capture user email before nested function
      const userEmail = user.email!;

      // Helper to perform registration request - matches sgt-member-management POST pattern
      // For POST requests: api-key goes in FORM BODY, not URL query param
      async function performRegistration(key: string): Promise<{ success: boolean; data: any; text: string; status: number }> {
        // Form data includes api-key in body (like sgt-member-management does for POSTs)
        const formData = new URLSearchParams();
        formData.append("api-key", key);
        formData.append("user_name", username);
        formData.append("user_email", userEmail);
        formData.append("user_password_new", password);

        const endpoint = `${SGT_BASE_URL}/${clubUrl}/members/register-new`;
        console.log(`[SGT-REGISTER] Registering user: ${username} with email: ${userEmail}`);
        console.log(`[SGT-REGISTER] POST ${endpoint} (api-key in body)`);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        const text = await response.text();
        console.log(`[SGT-REGISTER] Raw response (${response.status}): ${text.substring(0, 500)}`);
        
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          // Response is not JSON - could be error message
        }

        return { success: response.ok, data, text, status: response.status };
      }

      // First attempt with current API key
      let result = await performRegistration(activeApiKey);
      console.log(`[SGT-REGISTER] Parsed register response:`, result.data);

      // Check if we got INVALID API KEY - if so, force create new key and retry ONCE
      if (result.data === null && result.text.toUpperCase().includes("INVALID API KEY")) {
        console.log(`[SGT-REGISTER] Got INVALID API KEY, forcing new key creation and retrying...`);
        
        // Clear cached key
        cachedApiKey = null;
        
        // Force create a brand new API key (bypass the getApiKey cache logic)
        try {
          const freshKey = await createNewApiKey(adminClient, clubUrl);
          
          // Store in database
          await adminClient.from("sgt_api_config").upsert({
            api_key: freshKey.key,
            expires_at: freshKey.expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          });
          
           cachedApiKey = freshKey;
           activeApiKey = freshKey.key;
          console.log(`[SGT-REGISTER] Created fresh API key, retrying registration...`);
          
          // Retry registration with fresh key
          result = await performRegistration(freshKey.key);
          console.log(`[SGT-REGISTER] Retry parsed response:`, result.data);
        } catch (keyError) {
          console.error(`[SGT-REGISTER] Failed to create fresh API key:`, keyError);
          return new Response(
            JSON.stringify({
              error: "SGT API authentication failed. Please try again later.",
              details: String(keyError),
            }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

       // The OpenAPI spec defines a JSON response with { successful, feedback, userData }.
       // In practice we've also observed the endpoint sometimes returns a literal JSON `null` with HTTP 200.
       // If that happens, we proceed to fetch /members/list to confirm whether the account was actually created.
       let skipRegisterDataValidation = false;

       if (result.data === null) {
         const trimmed = (result.text || "").trim();
         const upperText = trimmed.toUpperCase();

         if (upperText.includes("INVALID API KEY")) {
           return new Response(
             JSON.stringify({
               error: "SGT authentication failed. Please contact support.",
               details: result.text,
             }),
             { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }

         // Special-case: literal JSON null (200 OK)
         if (trimmed === "null" && result.success) {
           console.warn("[SGT-REGISTER] Registration returned JSON null (200). Proceeding to member lookup to confirm creation.");
           skipRegisterDataValidation = true;
         } else {
           return new Response(
             JSON.stringify({
               error: "SGT API returned an unexpected response. Please try again.",
               details: result.text,
             }),
             { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
       }

       if (!skipRegisterDataValidation) {
         const registerData = result.data;

         // Check HTTP status
         if (!result.success) {
           return new Response(
             JSON.stringify({
               error: registerData?.feedback || "SGT API error. Please try again.",
               details: registerData,
             }),
             { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }

         // Check API success flag - response format: { successful: boolean, feedback: string, userData: { user_game_id, username } }
         if (registerData.successful === false) {
           return new Response(
             JSON.stringify({
               error: registerData.feedback || "Registration failed",
               details: registerData,
             }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }

         // If successful is not explicitly true, something unexpected happened
         if (registerData.successful !== true) {
           console.warn(`[SGT-REGISTER] Unexpected response format:`, registerData);
           return new Response(
             JSON.stringify({
               error: "Unexpected response from SGT. Please try again.",
               details: registerData,
             }),
             { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
       }

      // Extract user_id from the response
      // The API returns userData with user_game_id and username
      // We need to fetch the members list to get the actual user_id
      const membersResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/list?api-key=${encodeURIComponent(activeApiKey)}`,
        { method: "GET" }
      );

      if (!membersResponse.ok) {
        throw new Error("Failed to fetch members after registration");
      }

      const membersData = await membersResponse.json();
      const newMember = (membersData.members || []).find((m: any) => 
        m.user_name.toLowerCase() === username.toLowerCase()
      );

      if (!newMember) {
        console.error("[SGT-REGISTER] Could not find newly registered member");
        return new Response(
          JSON.stringify({ 
            error: "Registration succeeded but could not find member ID. Please contact support." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sgtUserId = newMember.user_id;
      console.log(`[SGT-REGISTER] Found new member with SGT user_id: ${sgtUserId}`);

      // Update the user's profile with the SGT user ID
      // This will trigger the auto-registration for tours/tournaments
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ sgt_user_id: sgtUserId })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[SGT-REGISTER] Failed to update profile:", updateError);
        return new Response(
          JSON.stringify({ 
            error: "Account created but failed to link. Please contact support.",
            sgt_user_id: sgtUserId
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[SGT-REGISTER] Successfully linked SGT account ${sgtUserId} to user ${user.id}`);

      // Always send notification email for new members (action required)
      console.log("[SGT-REGISTER] Sending onboarding notification email...");
      
      // Build the onboarding URL - points to the SGT Manager Registrations tab
      const rawUrl = Deno.env.get("SITE_URL") || "https://birdie-bay-bookings.lovable.app";
      const siteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, "") : `https://${rawUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
      const onboardingUrl = `${siteUrl}/admin/sgt-manager?tab=registrations`;
      
      try {
        const tenant = await getTenant();
        const emailHtml = await renderBrandedEmail(adminClient, "NEW LEAGUE MEMBER", buildNewMemberBody({
          username,
          email: user.email!,
          sgtUserId,
          registeredAt: new Date().toISOString(),
          onboardingUrl,
          typicalScore: typeof typicalScore === "string" ? typicalScore : undefined,
        }, tenant), { text: "ONBOARD PLAYER", url: onboardingUrl }, tenant);

        await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [tenant.support_email],
          subject: `🆕 Action Required: Onboard ${username} to ${tenant.venue_name} League`,
          html: emailHtml,
        });
        console.log("[SGT-REGISTER] Onboarding notification email sent");
      } catch (emailError) {
        console.error("[SGT-REGISTER] Failed to send notification email:", emailError);
        // Don't fail the registration if email fails
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          sgt_user_id: sgtUserId,
          username: username,
          message: "SGT account created and linked successfully!"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-REGISTER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
