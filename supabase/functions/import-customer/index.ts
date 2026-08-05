import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRequest {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  membershipTier: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[IMPORT-CUSTOMER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) throw new Error("Unauthorized: Admin role required");

    const { email, firstName, lastName, phone, membershipTier }: ImportRequest = await req.json();
    logStep("Processing customer", { email, firstName, lastName, membershipTier });

    if (!email) throw new Error("Email is required");

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;
    let updated = false;

    if (existingUser) {
      // User exists - update their profile
      logStep("User exists, updating profile", { userId: existingUser.id });
      userId = existingUser.id;
      updated = true;

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          // Note: We don't update membership_tier since they need to subscribe via Stripe
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (updateError) {
        logStep("Profile update error", { error: updateError.message });
        throw new Error(`Failed to update profile: ${updateError.message}`);
      }
    } else {
      // Create new user without password (they'll set it via password reset)
      logStep("Creating new user");
      
      // Generate a random secure password (user will reset it)
      const tempPassword = crypto.randomUUID() + crypto.randomUUID();
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          phone: phone
        }
      });

      if (createError) {
        logStep("User creation error", { error: createError.message });
        throw new Error(`Failed to create user: ${createError.message}`);
      }

      userId = newUser.user.id;
      logStep("User created", { userId });

      // The profile will be created by the trigger, but let's verify/update it
      // Wait a moment for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update profile with any additional data
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          // All imported users start as casual customers - they subscribe via Stripe for membership
          membership_tier: 'casual'
        })
        .eq("user_id", userId);

      if (profileError) {
        logStep("Profile update after creation error", { error: profileError.message });
      }
    }

    logStep("Import complete", { userId, updated });

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId,
        updated,
        message: updated ? "Customer profile updated" : "Customer created"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
