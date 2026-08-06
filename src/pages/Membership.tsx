import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Check, Crown, Loader2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import { usePricing, PricingTier } from "@/hooks/usePricing";
import { getDefaultTier, isDefaultTier, subscriptionTiers as getSubscriptionTiers } from "@/lib/tier-config";
import { useSavedCard } from "@/hooks/useSavedCard";
import { NoCardDialog } from "@/components/booking/NoCardDialog";
import { FrontlineVerificationDialog } from "@/components/membership/FrontlineVerificationDialog";

const Membership = () => {
  const { tenant } = useTenant();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pricing, isLoading: pricingLoading, getHourlyRate } = usePricing();
  const { savedCard, isLoadingSavedCard, refetchSavedCard } = useSavedCard();
  const [currentTier, setCurrentTier] = useState<string>("casual");
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<PricingTier | null>(null);
  const [showNoCardDialog, setShowNoCardDialog] = useState(false);
  const [verifyingTier, setVerifyingTier] = useState<PricingTier | null>(null);

  // Subscription tiers and the walk-in tier come entirely from pricing config
  const subscriptionTiers = getSubscriptionTiers(pricing);
  const casualPricing = getDefaultTier(pricing);
  const peakRate = casualPricing ? Number(casualPricing.hourly_rate) : 0;
  const offPeakRate = casualPricing
    ? Number(casualPricing.off_peak_hourly_rate ?? casualPricing.hourly_rate)
    : 0;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchCurrentMembership();
    }
  }, [user]);

  const fetchCurrentMembership = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("membership_tier")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setCurrentTier(data?.membership_tier || "casual");
    } catch (error) {
      console.error("Error fetching membership:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Show success toast if returning from successful subscription
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      const tier = searchParams.get("tier");
      toast.success(`Successfully subscribed to ${tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : ''} membership!`);
      fetchCurrentMembership();
    }
  }, [searchParams]);

  const handleSubscribe = async (tier: PricingTier) => {
    // Tiers that need eligibility confirmation ask for the customer's sector
    // before anything else — submitting the dialog is what starts the flow.
    if (tier.requires_verification) {
      setVerifyingTier(tier);
      return;
    }

    await continueSubscribe(tier);
  };

  const handleVerificationConfirmed = async (sector: string) => {
    const tier = verifyingTier;
    setVerifyingTier(null);
    if (!tier) return;

    try {
      await supabase.functions.invoke("notify-frontline-signup", {
        body: { sector, tier_key: tier.tier, tier_name: tier.display_name },
      });
    } catch (err) {
      console.error("[Membership] frontline notification failed", err);
    }

    await continueSubscribe(tier);
  };

  const continueSubscribe = async (tier: PricingTier) => {
    if (!tier.stripe_price_id) {
      toast.error("Subscription not available for this tier");
      return;
    }

    // Check if user has a saved card - if not, show dialog
    if (!savedCard && !isLoadingSavedCard) {
      setPendingTier(tier);
      setShowNoCardDialog(true);
      return;
    }

    await processSubscription(tier);
  };

  const processSubscription = async (tier: PricingTier) => {
    setSubscribingTier(tier.tier);

    try {
      const { data, error } = await supabase.functions.invoke("create-membership-checkout", {
        body: { 
          priceId: tier.stripe_price_id,
          tierKey: tier.tier,
        },
      });

      if (error) throw error;

      // If subscription was created directly (using saved card)
      if (data.success && data.subscriptionId) {
        toast.success(`Successfully subscribed to ${tier.display_name} membership!`);
        navigate(`/membership?success=true&tier=${tier.tier}`, { replace: true });
        fetchCurrentMembership();
        return;
      }

      // If redirecting to Stripe Checkout (no saved card) - this shouldn't happen now
      // since we require a card first, but keep as fallback
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating subscription:", error);
      toast.error("Failed to subscribe. Please try again.");
    } finally {
      setSubscribingTier(null);
    }
  };

  const handleCardAdded = async () => {
    await refetchSavedCard();
    // If there was a pending tier, process it after card is added
    if (pendingTier) {
      // Small delay to ensure card is fetched
      setTimeout(async () => {
        await processSubscription(pendingTier);
        setPendingTier(null);
        // Refresh membership status after subscription completes
        await fetchCurrentMembership();
      }, 500);
    }
  };

  if (authLoading || isLoading || pricingLoading || isLoadingSavedCard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const isCurrentTier = (tierKey: string) => currentTier === tierKey;
  const hasActiveMembership = !isDefaultTier(pricing, currentTier);
  const currentTierPricing = pricing.find(p => p.tier === currentTier);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-display text-base sm:text-2xl tracking-wide text-primary-foreground">
            MEMBERSHIP
          </span>
        </div>
        <img 
          src={venueLogo} 
          alt={tenant.venue_name} 
          className="h-7 sm:h-10 w-auto"
        />
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-4xl mx-auto">
          {/* Current membership info */}
          {hasActiveMembership && currentTierPricing && (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Crown className="h-6 w-6 text-accent" />
                  <div>
                    <CardTitle>Your Current Membership</CardTitle>
                    <CardDescription>
                      You are currently on the{" "}
                      <Badge variant="outline">
                        {currentTierPricing.display_name || currentTier}
                      </Badge>{" "}
                      plan at <span className="font-semibold">${currentTierPricing.hourly_rate}/hour</span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          )}

          {/* Intro text */}
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl md:text-4xl text-primary mb-2">
              {hasActiveMembership ? "UPGRADE YOUR MEMBERSHIP" : "BECOME A MEMBER"}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join the {tenant.venue_name} family and enjoy discounted hourly rates, exclusive access to leagues, and more perks. 
              All memberships are billed weekly with no lock-in contracts.
            </p>
          </div>

          {/* Walk-in pricing info */}
          {casualPricing && (
          <Card className="mb-8 border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {casualPricing.display_name} Pricing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-orange-600 border-orange-300">Peak</Badge>
                  <span className="font-semibold">${peakRate}/hr</span>
                  <span className="text-sm text-muted-foreground">(Mon–Fri from 4pm, Sat–Sun from 10am)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-600 border-green-300">Off-Peak</Badge>
                  <span className="font-semibold">${offPeakRate}/hr</span>
                  <span className="text-sm text-muted-foreground">(Mon–Fri 5:30am–4pm, Sat–Sun 5:30am–10am)</span>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Membership tiers grid */}
          {subscriptionTiers.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center space-y-2">
                <Crown className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-semibold">No membership plans yet</p>
                <p className="text-sm text-muted-foreground">
                  Memberships aren't available at {tenant.venue_name} right now. Book as a walk-in any time.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptionTiers.map((tier) => {
              return (
                <Card 
                  key={tier.tier} 
                  className={`relative flex flex-col border-2 border-border ${
                    isCurrentTier(tier.tier) ? "ring-2 ring-accent ring-offset-2" : ""
                  }`}
                >
                  {isCurrentTier(tier.tier) && (
                    <div className="absolute -top-3 right-4">
                      <Badge variant="outline" className="bg-background">Your Plan</Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="font-display text-2xl">{tier.display_name.toUpperCase()}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-accent">${tier.hourly_rate}</span>
                      <span className="text-muted-foreground"> Per Hour</span>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-3 mb-4 flex-1">
                      {tier.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-accent flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    {tier.restrictions && (
                      <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded mb-4">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{tier.restrictions}</span>
                      </div>
                    )}
                    
                    <div className="text-center mb-4">
                      <span className="text-2xl font-bold">${tier.weekly_subscription_price}</span>
                      <span className="text-muted-foreground"> per week</span>
                    </div>
                    
                    <Button
                      onClick={() => handleSubscribe(tier)}
                      disabled={isCurrentTier(tier.tier) || subscribingTier !== null}
                      className={`w-full ${
                        isCurrentTier(tier.tier) 
                          ? "bg-muted text-muted-foreground" 
                          : "bg-accent text-accent-foreground hover:bg-accent/90"
                      }`}
                    >
                      {subscribingTier === tier.tier ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrentTier(tier.tier) ? (
                        "Current Plan"
                      ) : hasActiveMembership ? (
                        "Switch Plan"
                      ) : (
                        "Subscribe"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Break-even comparison */}
          {subscriptionTiers.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg">Which membership is right for you?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {subscriptionTiers.map((tier) => {
                  const weeklyPrice = tier.weekly_subscription_price ?? 0;
                  const hourlyRate = tier.hourly_rate;
                  const saving = peakRate - hourlyRate;
                  const breakEvenVsPeak = saving > 0 ? Math.ceil(weeklyPrice / saving) : null;
                  
                  return (
                    <p key={tier.tier}>
                      <strong>{tier.display_name} (${weeklyPrice}/wk):</strong>{" "}
                      ${hourlyRate}/hr rate.{breakEvenVsPeak !== null && ` Break-even at ~${breakEvenVsPeak} hours/week vs the peak walk-in rate.`}
                    </p>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Footer note */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            Need to cancel or make changes? Email us at {tenant.support_email} and we'll help you out.
          </p>
        </div>
      </main>

      <FrontlineVerificationDialog
        open={!!verifyingTier}
        tierName={verifyingTier?.display_name ?? ""}
        onOpenChange={(open) => !open && setVerifyingTier(null)}
        onConfirm={handleVerificationConfirmed}
      />

      {/* No Card Dialog */}
      <NoCardDialog
        open={showNoCardDialog}
        onClose={() => {
          setShowNoCardDialog(false);
          setPendingTier(null);
        }}
        onCardAdded={handleCardAdded}
        returnPath="/card-added"
      />
    </div>
  );
};

export default Membership;
