import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { loadTiers, TierRow } from "../_shared/tiers.ts";
import { getTenant, tenantHubUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

const triggerBookingConfirmation = async (bookingId: string) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing backend configuration for booking notification");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-booking-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      booking_id: bookingId,
      notification_type: "confirmation",
    }),
  });

  const responseText = await response.text();
  let responseBody: any = responseText;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    // Keep raw text body for logging.
  }

  if (!response.ok) {
    logStep("Booking notification failed", {
      bookingId,
      status: response.status,
      response: responseBody,
    });
    return { success: false, status: response.status, response: responseBody };
  }

  logStep("Booking notification completed", { bookingId, response: responseBody });
  return { success: true, status: response.status, response: responseBody };
};

// Tier names, prices and ranking are all read from `pricing_config`.
const buildTierMaps = (tiers: TierRow[]) => {
  const ordered = [...tiers]
    .filter((t) => t.is_subscription && !t.is_default)
    .sort((a, b) => a.display_order - b.display_order);
  const names: Record<string, string> = {};
  const prices: Record<string, string> = {};
  const rank: Record<string, number> = {};
  ordered.forEach((t, i) => {
    names[t.tier] = t.display_name || t.tier;
    prices[t.tier] = t.weekly_subscription_price !== null && t.weekly_subscription_price !== undefined
      ? `$${Number(t.weekly_subscription_price).toFixed(2)}`
      : "";
    rank[t.tier] = i + 1;
  });
  tiers.filter((t) => t.is_default).forEach((t) => {
    names[t.tier] = t.display_name || t.tier;
  });
  return { names, prices, rank, walkInTier: tiers.find((t) => t.is_default)?.tier ?? "casual" };
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};


// Dynamically build price to tier map from database
const getPriceToTierMap = async (supabaseAdmin: any): Promise<Record<string, string>> => {
  const { data: pricingConfig } = await supabaseAdmin
    .from("pricing_config")
    .select("tier, stripe_price_id")
    .eq("is_subscription", true);
  
  const map: Record<string, string> = {};
  if (pricingConfig) {
    for (const config of pricingConfig as Array<{ tier: string; stripe_price_id: string | null }>) {
      if (config.stripe_price_id) {
        map[config.stripe_price_id] = config.tier;
      }
    }
  }
  logStep("Loaded price to tier map", { map });
  return map;
};

// Remove user from SGT tour when downgraded
const removeFromSGT = async (supabaseAdmin: any, email: string) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, sgt_user_id")
      .eq("email", email)
      .maybeSingle();

    if (!profile?.sgt_user_id) {
      logStep("No SGT user ID found, skipping SGT removal", { email });
      return;
    }

    const sgtUserId = profile.sgt_user_id;
    logStep("Removing user from SGT", { email, sgtUserId });

    // Find the active tour
    const { data: activeTour } = await supabaseAdmin
      .from("sgt_tours")
      .select("tour_id")
      .eq("active", 1)
      .single();

    if (!activeTour) {
      logStep("No active tour found, skipping SGT removal");
      return;
    }

    // Remove from tour members
    const { error: tourMemberError } = await supabaseAdmin
      .from("sgt_tour_members")
      .delete()
      .eq("tour_id", activeTour.tour_id)
      .eq("user_id", sgtUserId);

    if (tourMemberError) {
      logStep("Error removing from tour members", { error: tourMemberError.message });
    } else {
      logStep("Removed from SGT tour members", { tourId: activeTour.tour_id, sgtUserId });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("Error during SGT removal", { email, error: errorMessage });
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!stripeKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-07-30.basil" });
    const resend = resendApiKey ? new Resend(resendApiKey) : null;
    
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No Stripe signature found");
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logStep("Webhook signature verification failed", { error: errorMessage });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Event verified", { type: event.type, id: event.id });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const tenant = await getTenant();

    // ─── IDEMPOTENCY GUARD ───
    // Stripe may redeliver the same event (webhook timeout, non-2xx, etc.).
    // Insert event.id into stripe_processed_events; on conflict, short-circuit
    // so no downstream side effect (emails, refunds, tier changes) runs twice.
    {
      const { error: dedupError } = await supabaseAdmin
        .from("stripe_processed_events")
        .insert({ event_id: event.id, event_type: event.type });

      if (dedupError) {
        // Unique violation = already processed; anything else = log & continue
        // (fail-open to avoid dropping legitimate events on transient DB errors).
        if ((dedupError as any).code === "23505") {
          logStep("Duplicate Stripe event, skipping", { id: event.id, type: event.type });
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        logStep("Idempotency insert failed (continuing)", { error: dedupError.message });
      }
    }

    // Load dynamic price to tier map
    const PRICE_TO_TIER = await getPriceToTierMap(supabaseAdmin);
    const configuredTiers = await loadTiers(supabaseAdmin);
    const {
      names: TIER_NAMES,
      prices: TIER_WEEKLY_PRICES,
      rank: TIER_RANK,
      walkInTier: WALK_IN_TIER,
    } = buildTierMaps(configuredTiers);

    // ─── SUBSCRIPTION CREATED / UPDATED ───
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      
      logStep("Processing subscription", { subscriptionId: subscription.id, status: subscription.status });

      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        logStep("Customer deleted, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (!email) {
        logStep("No email found for customer");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logStep("Found customer email", { email });

      // past_due/unpaid are now handled immediately by invoice.payment_failed
      if (subscription.status === "past_due" || subscription.status === "unpaid") {
        logStep("Subscription is past_due/unpaid - handled by invoice.payment_failed", { email, status: subscription.status });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only update tier if subscription is active
      if (subscription.status === "active") {
        const priceId = subscription.items.data[0]?.price?.id;
        const newTier = priceId ? PRICE_TO_TIER[priceId] : null;

        if (newTier) {
          logStep("Updating membership tier", { email, newTier });

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, membership_tier, custom_billing")
            .eq("email", email)
            .maybeSingle();

          // Skip if custom billing
          if (profile?.custom_billing) {
            logStep("Customer has custom billing, skipping tier update", { email });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const previousTier = profile?.membership_tier;
          const isNewMembership = previousTier === WALK_IN_TIER || !previousTier;
          const isTierChange = !isNewMembership && previousTier && previousTier !== newTier;
          const previousTierName = previousTier ? (TIER_NAMES[previousTier] || previousTier) : "";

          // Rank tiers (by configured display order) to detect upgrade vs downgrade
          const isUpgrade = isTierChange && (TIER_RANK[newTier] || 0) > (TIER_RANK[previousTier || ""] || 0);

          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: newTier })
            .eq("email", email);

          if (error) {
            logStep("Error updating profile", { error: error.message });
            throw error;
          }

          logStep("Membership tier updated successfully", { previousTier, newTier, isNewMembership, isTierChange, isUpgrade });

          // Send confirmation email — welcome for new members, upgrade/change for tier switches
          if (resend && (isNewMembership || isTierChange || event.type === "customer.subscription.created")) {
            const firstName = profile?.first_name || customer.name?.split(" ")[0] || "there";
            const lastName = profile?.last_name || "";
            const tierName = TIER_NAMES[newTier] || newTier;
            const weeklyPrice = TIER_WEEKLY_PRICES[newTier] || "";

            // Pick the right template
            const templateKey = isTierChange
              ? (isUpgrade ? "membership_upgraded" : "membership_changed")
              : "membership_activated";

            let { data: emailTemplate } = await supabaseAdmin
              .from("email_templates")
              .select("*")
              .eq("template_key", templateKey)
              .eq("is_active", true)
              .maybeSingle();

            // Fallback to the standard activation template if a change template isn't configured
            if (!emailTemplate && isTierChange) {
              const { data: fallback } = await supabaseAdmin
                .from("email_templates")
                .select("*")
                .eq("template_key", "membership_activated")
                .eq("is_active", true)
                .maybeSingle();
              emailTemplate = fallback;
            }

            const templateTags: Record<string, string> = {
              '{first_name}': firstName,
              '{last_name}': lastName,
              '{email}': email,
              '{tier_name}': tierName,
              '{previous_tier_name}': previousTierName,
              '{weekly_price}': weeklyPrice,
            };

            const defaultSubject = isTierChange
              ? (isUpgrade
                  ? `You've Upgraded to ${tierName} — Welcome!`
                  : `Your Membership Has Changed to ${tierName}`)
              : `Welcome to the ${tierName} Membership!`;

            const heading = isTierChange
              ? (isUpgrade ? `Upgraded to ${tierName}!` : `Now on ${tierName}`)
              : `Welcome to ${tierName}!`;

            let subject = emailTemplate?.subject || defaultSubject;
            let htmlContent: string;

            if (emailTemplate?.html_content) {
              const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
              subject = replaceTemplateTags(subject, templateTags);
              htmlContent = await renderBrandedEmail(supabaseAdmin, heading, bodyContent, {
                text: "Book Now",
                url: tenantHubUrl(tenant, "/booking")
              });
            } else if (isTierChange) {
              const changeCopy = isUpgrade
                ? `Hi ${firstName}, your membership has been <strong>upgraded from ${previousTierName} to ${tierName}</strong>. Your new benefits are active immediately.`
                : `Hi ${firstName}, your membership has been changed from <strong>${previousTierName}</strong> to <strong>${tierName}</strong>. Your new plan is active immediately.`;
              const bodyContent = `
                <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                  ${changeCopy}
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #B5772A;">
                  <tr>
                    <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134; text-align:center;">
                      <p style="margin:5px 0;"><strong>Previous:</strong> ${previousTierName}</p>
                      <p style="margin:5px 0;"><strong>New Membership:</strong> ${tierName}</p>
                      <p style="margin:5px 0;"><strong>Weekly Price:</strong> ${weeklyPrice}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                  Your old plan has been cancelled and any duplicate charges from the switch are handled automatically. If anything doesn't look right, just reply to this email.
                </p>
              `;
              htmlContent = await renderBrandedEmail(supabaseAdmin, heading, bodyContent, {
                text: "Book Now",
                url: tenantHubUrl(tenant, "/booking")
              });
            } else {
              const bodyContent = `
                <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                  Hi ${firstName}, congratulations! Your <strong>${tierName}</strong> membership is now active.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #B5772A;">
                  <tr>
                    <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134; text-align:center;">
                      <p style="margin:5px 0;"><strong>Membership:</strong> ${tierName}</p>
                      <p style="margin:5px 0;"><strong>Weekly Price:</strong> ${weeklyPrice}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                  You now have access to discounted bay rates and exclusive member benefits including the ${tenant.venue_name} League!
                </p>
              `;
              htmlContent = await renderBrandedEmail(supabaseAdmin, heading, bodyContent, {
                text: "Book Now",
                url: tenantHubUrl(tenant, "/booking")
              });
            }

            try {
              await resend.emails.send({
                from: `${tenant.venue_name} <${tenant.sender_email}>`,
                to: [email],
                subject: subject,
                html: htmlContent,
              });
              logStep("Membership email sent", { email, tier: tierName, templateKey, isTierChange, isUpgrade });
            } catch (emailError) {
              logStep("Failed to send membership email", { error: emailError });
            }
          }
        } else {
          logStep("Unknown price ID, not updating tier", { priceId });
        }
      }
    }

    // ─── SUBSCRIPTION DELETED ───
    // This is the SINGLE place that handles downgrade + cancellation email.
    // Triggered by: voluntary cancellation, admin cancellation, OR immediate cancel from payment failure.
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      logStep("Subscription cancelled", { subscriptionId: subscription.id });

      // Skip if this cancellation was part of an in-flight upgrade/tier switch —
      // create-membership-checkout tags the old sub before cancelling it.
      if (subscription.metadata?.cancellation_reason === "upgrade") {
        logStep("Cancellation is part of an upgrade, skipping tier reset + email", {
          subscriptionId: subscription.id,
          upgradeTo: subscription.metadata?.upgrade_to_tier,
        });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        logStep("Customer deleted, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if customer has any other active subscriptions (e.g., plan switch)
      const activeSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });

      if (activeSubscriptions.data.length > 0) {
        logStep("Customer has another active subscription, skipping tier reset", { 
          cancelledSubscription: subscription.id,
          activeSubscription: activeSubscriptions.data[0].id 
        });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (email) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, membership_tier, custom_billing")
          .eq("email", email)
          .maybeSingle();

        // Skip if custom billing
        if (profile?.custom_billing) {
          logStep("Customer has custom billing, skipping tier reset", { email });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const alreadyVisitor = profile?.membership_tier === WALK_IN_TIER;
        const firstName = profile?.first_name || customer.name?.split(" ")[0] || "there";
        const lastName = profile?.last_name || "";
        const previousTier = alreadyVisitor ? "Member" : (profile?.membership_tier ? TIER_NAMES[profile.membership_tier] || profile.membership_tier : "Member");

        // Determine if this cancellation was triggered by a payment failure
        const isPaymentFailure = subscription.metadata?.cancellation_reason === "payment_failed";
        logStep("Processing subscription deletion", { email, previousTier, isPaymentFailure, alreadyVisitor });

        if (!alreadyVisitor) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: WALK_IN_TIER })
            .eq("email", email);

          if (error) {
            logStep("Error resetting profile", { error: error.message });
            throw error;
          }
          logStep("Membership tier reset to the walk-in tier");
        } else {
          logStep("Already on walk-in tier (cancelled by admin), proceeding to send email");
        }

        // Remove from SGT tour
        await removeFromSGT(supabaseAdmin, email);

        // Send ONE cancellation email — different content for payment failure vs voluntary
        if (resend) {
          const templateKey = isPaymentFailure ? "membership_payment_failed" : "membership_cancelled";
          const { data: emailTemplate } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("template_key", templateKey)
            .eq("is_active", true)
            .single();

          // Fallback: try the generic template if specific one not found
          let finalTemplate = emailTemplate;
          if (!finalTemplate && isPaymentFailure) {
            const { data: fallbackTemplate } = await supabaseAdmin
              .from("email_templates")
              .select("*")
              .eq("template_key", "membership_cancelled")
              .eq("is_active", true)
              .single();
            finalTemplate = fallbackTemplate;
          }

          const templateTags: Record<string, string> = {
            '{first_name}': firstName,
            '{last_name}': lastName,
            '{email}': email,
            '{tier_name}': previousTier,
          };

          let subject: string;
          let htmlContent: string;

          if (finalTemplate?.html_content) {
            subject = replaceTemplateTags(finalTemplate.subject || `Your ${tenant.venue_name} Membership`, templateTags);
            const bodyContent = replaceTemplateTags(finalTemplate.html_content, templateTags);
            htmlContent = await renderBrandedEmail(supabaseAdmin, "Membership Update", bodyContent, {
              text: "View My Account",
              url: tenantHubUrl(tenant, "/my-account")
            });
          } else if (isPaymentFailure) {
            // Payment failure specific default email
            subject = "Payment Failed — Your Membership Has Been Cancelled";
            htmlContent = await renderBrandedEmail(supabaseAdmin, 
              "Payment Failed",
              `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Hi ${firstName}, unfortunately your card payment for your <strong>${previousTier}</strong> membership could not be processed.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #B5772A;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134;">
                    <h3 style="margin:0 0 10px 0; font-family:Archivo, Impact, Arial Black, sans-serif; color:#2F3134;">What happened?</h3>
                    <ul style="margin:0; padding-left:20px;">
                      <li style="margin-bottom:8px;">Your card on file was declined when we tried to take your membership payment</li>
                      <li style="margin-bottom:8px;">Your membership has been cancelled and your account has been moved to <strong>${TIER_NAMES[WALK_IN_TIER] || "walk-in"}</strong> status</li>
                      <li style="margin-bottom:8px;">You can still book sessions at our standard walk-in rates</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                To get your membership back, simply update your payment method and re-register through your account.
              </p>
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.6; color:#2F3134; text-align:center; opacity:0.8;">
                If you believe this was an error, please contact us and we'll help sort it out.
              </p>
              `,
              { text: "Re-Register Membership", url: tenantHubUrl(tenant, "/membership") }
            );
          } else {
            // Voluntary cancellation default email
            subject = `Your ${tenant.venue_name} Membership Has Been Cancelled`;
            htmlContent = await renderBrandedEmail(supabaseAdmin, 
              "Membership Cancelled",
              `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Hi ${firstName}, your <strong>${previousTier}</strong> membership has been cancelled.
              </p>
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Your account has been reverted to Visitor status. You can still book sessions at our standard walk-in rates.
              </p>
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                If you'd like to rejoin, simply re-register for a membership through your account.
              </p>
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                We hope to see you back soon!<br/>
                <strong>The ${tenant.venue_name} Team</strong>
              </p>
              `,
              { text: "Rejoin Membership", url: tenantHubUrl(tenant, "/membership") }
            );
          }

          try {
            await resend.emails.send({
              from: `${tenant.venue_name} <${tenant.sender_email}>`,
              to: [email],
              subject: subject,
              html: htmlContent,
            });
            logStep("Membership cancellation email sent", { email, isPaymentFailure });
          } catch (emailError) {
            logStep("Failed to send membership cancellation email", { error: emailError });
          }
        }
      }
    }

    // ─── CHECKOUT SESSION COMPLETED ───
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const purpose = session.metadata?.purpose;
      const bookingId = session.metadata?.booking_id;
      const giftCardId = session.metadata?.gift_card_id;
      const paymentIntentId = session.payment_intent as string;

      logStep("Checkout session completed", { sessionId: session.id, purpose, bookingId, giftCardId, paymentIntentId });

      // ── PREPAID HOUR PACKS ──
      const packLotId = session.metadata?.pack_lot_id;
      if (purpose === "pack" && packLotId) {
        const { data: lot } = await supabaseAdmin
          .from("pack_lots")
          .select("id, status, is_gift, validity_days, user_id")
          .eq("id", packLotId)
          .maybeSingle();

        if (!lot) {
          logStep("Pack lot missing", { packLotId });
        } else if (lot.status !== "pending_payment") {
          logStep("Pack lot already processed, skipping", { packLotId, status: lot.status });
        } else {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + lot.validity_days * 24 * 60 * 60 * 1000);

          await supabaseAdmin
            .from("pack_lots")
            .update({
              status: lot.is_gift ? "unredeemed" : "active",
              purchased_at: now.toISOString(),
              // Gift packs start their clock when redeemed, not when bought
              expires_at: lot.is_gift ? null : expiresAt.toISOString(),
              stripe_payment_intent_id: paymentIntentId,
            })
            .eq("id", packLotId);

          if (!lot.is_gift && lot.user_id) {
            const { data: balance } = await supabaseAdmin.rpc("pack_hours_balance", {
              _user_id: lot.user_id,
            });
            await supabaseAdmin.from("pack_transactions").insert({
              user_id: lot.user_id,
              lot_id: packLotId,
              hours: (await supabaseAdmin
                .from("pack_lots")
                .select("hours_total")
                .eq("id", packLotId)
                .maybeSingle()).data?.hours_total ?? 0,
              balance_after: Number(balance) || 0,
              transaction_type: "purchase",
              description: "Prepaid hours pack purchased",
            });
          }

          try {
            await supabaseAdmin.functions.invoke("send-pack-email", {
              body: { pack_lot_id: packLotId, kind: lot.is_gift ? "gift" : "purchase" },
            });
          } catch (e) {
            logStep("send-pack-email invoke failed", { error: String(e) });
          }

          logStep("Pack activated", { packLotId, isGift: lot.is_gift });
        }
      }


      // ── GIFT CARD PAYMENTS ──
      if (purpose === "gift_card" && giftCardId) {
        // Brisbane today (UTC+10, no DST)
        const brisbaneToday = new Date(new Date().getTime() + 10 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const { data: card } = await supabaseAdmin
          .from("gift_cards")
          .select("scheduled_for, status")
          .eq("id", giftCardId)
          .maybeSingle();

        if (!card) {
          logStep("Gift card row missing", { giftCardId });
        } else if (card.status !== "pending_payment") {
          logStep("Gift card already processed, skipping", { giftCardId, status: card.status });
        } else {
          const isFuture = card.scheduled_for && card.scheduled_for > brisbaneToday;
          if (isFuture) {
            // Schedule it; cron will pick up on the scheduled date
            await supabaseAdmin
              .from("gift_cards")
              .update({ status: "scheduled", paid_at: new Date().toISOString() })
              .eq("id", giftCardId);
            logStep("Gift card scheduled", { giftCardId, scheduled_for: card.scheduled_for });
          } else {
            // Send immediately
            await supabaseAdmin
              .from("gift_cards")
              .update({ status: "pending", paid_at: new Date().toISOString() })
              .eq("id", giftCardId);

            try {
              await supabaseAdmin.functions.invoke("issue-gift-card", {
                body: { gift_card_id: giftCardId },
              });
              logStep("issue-gift-card invoked for immediate send", { giftCardId });
            } catch (e) {
              logStep("issue-gift-card invoke failed", { error: String(e) });
            }
          }
        }
      }

      // ── BOOKING PAYMENTS ──
      if (bookingId) {
        const { error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({
            status: "confirmed",
            payment_method: "card",
            stripe_payment_intent_id: paymentIntentId,
          })
          .eq("id", bookingId);

        if (updateError) {
          logStep("Error updating booking", { error: updateError.message });
        } else {
          logStep("Booking confirmed successfully", { bookingId });

          try {
            const notificationResult = await triggerBookingConfirmation(bookingId);
            logStep("Booking notification handled", notificationResult);
          } catch (notificationError) {
            logStep("Failed to send booking notification", {
              error: notificationError instanceof Error ? notificationError.message : String(notificationError),
            });
          }
        }
      }
    }

    // ─── INVOICE PAYMENT FAILED ───
    // Soft-retry policy:
    //   attempt_count === 1 → send friendly heads-up, let Stripe Smart Retries handle it
    //   attempt_count >= 2  → cancel sub + void invoice (existing destructive flow)
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const attemptCount = (invoice as any).attempt_count ?? 1;

      let subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
        subscriptionId = (invoice as any).parent.subscription_details.subscription;
      }

      logStep("Payment failed", { invoiceId: invoice.id, subscriptionId, attemptCount });

      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.pause_collection) {
            logStep("Subscription is paused (membership on hold), skipping", {
              subscriptionId,
              pauseBehavior: subscription.pause_collection.behavior,
            });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (subError) {
          logStep("Could not check subscription pause status, proceeding", { error: subError });
        }

        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          logStep("Customer deleted, skipping");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const email = customer.email;
        let firstName = "";
        let userId: string | null = null;
        if (email) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("user_id, custom_billing, first_name")
            .eq("email", email)
            .maybeSingle();

          if (profile?.custom_billing) {
            logStep("Customer has custom billing, skipping cancellation", { email });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          firstName = profile?.first_name ?? "";
          userId = profile?.user_id ?? null;
        }

        // First failure: flag profile, cancel + refund all future bookings, send heads-up
        if (attemptCount < 2) {
          let cancelledCount = 0;

          if (userId) {
            // Flag profile so new bookings are blocked by DB trigger
            await supabaseAdmin
              .from("profiles")
              .update({ payment_failed_at: new Date().toISOString() })
              .eq("user_id", userId);
            logStep("Profile flagged with payment_failed_at", { userId });

            // Fetch future confirmed bookings (Brisbane today onward)
            const brisbaneToday = new Date(
              new Date().toLocaleString("en-US", { timeZone: "Australia/Brisbane" })
            )
              .toISOString()
              .slice(0, 10);

            const { data: futureBookings } = await supabaseAdmin
              .from("bookings")
              .select("id, stripe_payment_intent_id, payment_method, total_price, user_id")
              .eq("user_id", userId)
              .in("status", ["confirmed", "pending"])
              .gte("booking_date", brisbaneToday);

            for (const b of futureBookings ?? []) {
              // Stripe refund
              if (
                b.stripe_payment_intent_id &&
                (b.payment_method === "stripe" || b.payment_method === "card")
              ) {
                try {
                  await stripe.refunds.create({
                    payment_intent: b.stripe_payment_intent_id,
                    reason: "requested_by_customer",
                  });
                } catch (refundErr) {
                  logStep("Refund failed for booking (continuing)", {
                    bookingId: b.id,
                    error: refundErr,
                  });
                }
              } else if (b.payment_method === "balance" || b.payment_method === "partial") {
                // Credit balance refund
                const amount = parseFloat(b.total_price as any) || 0;
                if (amount > 0) {
                  const { data: prof } = await supabaseAdmin
                    .from("profiles")
                    .select("deposit_balance")
                    .eq("user_id", b.user_id)
                    .single();
                  const current = parseFloat((prof?.deposit_balance as any) ?? 0);
                  const newBal = current + amount;
                  await supabaseAdmin
                    .from("profiles")
                    .update({ deposit_balance: newBal })
                    .eq("user_id", b.user_id);
                  await supabaseAdmin.from("deposit_transactions").insert({
                    user_id: b.user_id,
                    amount,
                    balance_before: current,
                    balance_after: newBal,
                    transaction_type: "refund",
                    description: "Booking cancelled — membership payment failed",
                    related_booking_id: b.id,
                  });
                }
              }

              // Mark cancelled with reason
              await supabaseAdmin
                .from("bookings")
                .update({
                  status: "cancelled",
                  cancellation_reason: "Membership payment failed — booking refunded",
                })
                .eq("id", b.id);
              cancelledCount++;

            }
            logStep("Cancelled future bookings due to payment failure", {
              userId,
              cancelledCount,
            });
          }

          if (email) {
            try {
              const amountDollars = (invoice.amount_due ?? 0) / 100;
              await supabaseAdmin.functions.invoke("send-payment-retry-warning", {
                body: {
                  email,
                  first_name: firstName,
                  amount: amountDollars,
                  cancelled_bookings: cancelledCount,
                },
              });
              logStep("Heads-up email sent", { email, amount: amountDollars, cancelledCount });
            } catch (emailErr) {
              logStep("Failed to send heads-up email (non-blocking)", { error: emailErr });
            }
          }
          return new Response(
            JSON.stringify({ received: true, action: "blocked_and_cancelled", cancelledCount }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }


        // Second+ failure: cancel + void
        try {
          await stripe.subscriptions.update(subscriptionId, {
            metadata: { cancellation_reason: "payment_failed" },
          });
          await stripe.subscriptions.cancel(subscriptionId);
          logStep("Subscription cancelled after retry failure", { subscriptionId, attemptCount });
        } catch (cancelError) {
          logStep("Failed to cancel subscription", { error: cancelError });
        }

        try {
          await stripe.invoices.voidInvoice(invoice.id);
          logStep("Failed invoice voided", { invoiceId: invoice.id });
        } catch (voidError) {
          logStep("Could not void invoice (may already be handled)", { error: voidError });
        }
      }
    }

    // ─── INVOICE PAYMENT SUCCEEDED ───
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      
      let subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
        subscriptionId = (invoice as any).parent.subscription_details.subscription;
      }

      logStep("Invoice payment succeeded", { 
        invoiceId: invoice.id, 
        subscriptionId, 
        customerId,
        billingReason: invoice.billing_reason,
        amountPaid: invoice.amount_paid,
      });

      // Only process subscription invoices
      if (!subscriptionId) {
        logStep("No subscription ID, skipping (not a subscription invoice)");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (invoice.billing_reason === "manual") {
        logStep("Manual billing reason, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let customer;
      try {
        customer = await stripe.customers.retrieve(customerId);
      } catch (customerError) {
        logStep("Error retrieving customer", { error: customerError });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (customer.deleted) {
        logStep("Customer deleted, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (!email) {
        logStep("No email found, cannot record payment");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, membership_tier")
        .eq("email", email)
        .maybeSingle();

      if (profileError || !profile?.user_id) {
        logStep("No profile found", { email });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine tier from subscription price
      let tier = profile.membership_tier || "unknown";
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        if (priceId && PRICE_TO_TIER[priceId]) {
          tier = PRICE_TO_TIER[priceId];
        }
      } catch (subError) {
        logStep("Error retrieving subscription, using profile tier", { error: subError });
      }

      const amount = (invoice.amount_paid || 0) / 100;

      // Skip $0 payments
      if (amount <= 0) {
        logStep("Skipping $0 payment", { invoiceId: invoice.id });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record membership payment
      const { error: insertError } = await supabaseAdmin
        .from("membership_payments")
        .upsert({
          user_id: profile.user_id,
          stripe_invoice_id: invoice.id,
          stripe_customer_id: customerId,
          amount: amount,
          tier: tier,
          period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
          period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
          paid_at: new Date().toISOString(),
        }, {
          onConflict: 'stripe_invoice_id'
        });

      if (insertError) {
        logStep("Error recording membership payment", { error: insertError.message });
      } else {
        logStep("Membership payment recorded", { email, tier, amount, invoiceId: invoice.id });
      }

      // Clear payment_failed_at flag so customer can book again
      const { error: clearError } = await supabaseAdmin
        .from("profiles")
        .update({ payment_failed_at: null })
        .eq("user_id", profile.user_id)
        .not("payment_failed_at", "is", null);
      if (!clearError) {
        logStep("Cleared payment_failed_at flag", { userId: profile.user_id });
      }

    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
