import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CANCEL-MEMBERSHIP] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id } = await req.json();

    if (!user_id) throw new Error("user_id is required");
    logStep("Processing cancellation", { user_id });

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, first_name, last_name, membership_tier, custom_billing")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    logStep("Profile found", { email: profile.email, tier: profile.membership_tier });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find and cancel Stripe subscription
    let cancelledAny = false;
    const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
    
    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      logStep("Found Stripe customer", { customerId });

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });

      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
        cancelledAny = true;
        logStep("Cancelled subscription", { subscriptionId: sub.id });
      }
    } else {
      logStep("No Stripe customer found, skipping subscription cancellation");
    }

    const previousTier = profile.membership_tier || "Member";

    // Update profile to casual tier
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ membership_tier: "casual" })
      .eq("user_id", user_id);

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }
    logStep("Updated profile to casual tier");

    // When Stripe cancelled a subscription, the webhook sends the cancellation email.
    // With no live subscription there is no webhook, so send it here using the same
    // membership_cancelled template.
    if (!cancelledAny && profile.email) {
      try {
        const tenant = await getTenant();
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          const { data: tpl } = await supabaseClient
            .from("email_templates")
            .select("subject, html_content, is_active")
            .eq("template_key", "membership_cancelled")
            .eq("is_active", true)
            .maybeSingle();

          const tags: Record<string, string> = {
            "{first_name}": profile.first_name || "there",
            "{last_name}": profile.last_name || "",
            "{email}": profile.email,
            "{tier_name}": previousTier,
          };
          const applyTags = (s: string) => {
            let out = s;
            for (const [k, v] of Object.entries(tags)) out = out.replaceAll(k, v);
            return out;
          };

          const subject = applyTags(
            tpl?.subject || `Your ${tenant.venue_name} Membership Has Been Cancelled`,
          );
          const body = tpl?.html_content
            ? applyTags(tpl.html_content)
            : `
              <p>Hi ${tags["{first_name}"]}, your <strong>${previousTier}</strong> membership has been cancelled.</p>
              <p>Your account has been reverted to Casual status. You can still book sessions at our standard casual rates.</p>
            `;

          const html = await renderBrandedEmail(
            supabaseClient,
            "Membership Cancelled",
            body,
            { text: "Rejoin Membership", url: tenantHubUrl(tenant, "/membership") },
            tenant,
          );

          const resend = new Resend(resendKey);
          await resend.emails.send({
            from: `${tenant.venue_name} <${tenant.sender_email}>`,
            to: [profile.email],
            subject,
            html,
          });
          logStep("Cancellation email sent (no Stripe subscription)", { email: profile.email });
        }
      } catch (emailErr: any) {
        logStep("Failed to send cancellation email (non-blocking)", { error: emailErr?.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Membership cancelled successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
