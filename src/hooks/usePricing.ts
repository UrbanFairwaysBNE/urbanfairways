import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  TierConfig,
  TIER_SELECT,
  findTier,
  getDefaultTier,
  normaliseTier,
  subscriptionTiers,
  tierLabel,
  grantsLeagueAccess,
  grantsRangeAccess,
} from "@/lib/tier-config";
import { defaultOffPeakRate, defaultPeakRate } from "@/lib/pricing-utils";

export type PricingTier = TierConfig;

/**
 * Loads the venue's membership tiers from `pricing_config`.
 * A brand-new venue has zero tiers — every helper degrades gracefully.
 */
export function usePricing() {
  const [pricing, setPricing] = useState<TierConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPricing = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("pricing_config")
      .select(TIER_SELECT)
      .order("display_order");

    if (fetchError) {
      console.error("Error fetching pricing:", fetchError);
      setError(fetchError.message);
    } else if (data) {
      setPricing((data as Record<string, unknown>[]).map(normaliseTier));
    }

    setIsLoading(false);
  };

  const getHourlyRate = (tier: string): number => {
    const tierPricing = findTier(pricing, tier);
    if (tierPricing) return Number(tierPricing.hourly_rate);
    return defaultPeakRate(pricing);
  };

  const getWeeklyPrice = (tier: string): number | null => {
    const tierPricing = findTier(pricing, tier);
    return tierPricing?.weekly_subscription_price ?? null;
  };

  const getStripePriceId = (tier: string): string | null =>
    findTier(pricing, tier)?.stripe_price_id || null;

  useEffect(() => {
    fetchPricing();
  }, []);

  return {
    pricing,
    isLoading,
    error,
    /** No tiers configured yet (fresh venue) */
    isUnconfigured: !isLoading && pricing.length === 0,
    defaultTier: getDefaultTier(pricing),
    memberTiers: subscriptionTiers(pricing),
    peakRate: defaultPeakRate(pricing),
    offPeakRate: defaultOffPeakRate(pricing),
    getTier: (tier: string) => findTier(pricing, tier),
    getTierLabel: (tier?: string | null) => tierLabel(pricing, tier),
    hasLeagueAccess: (tier?: string | null) => grantsLeagueAccess(pricing, tier),
    hasRangeAccess: (tier?: string | null) => grantsRangeAccess(pricing, tier),
    getHourlyRate,
    getWeeklyPrice,
    getStripePriceId,
    refetch: fetchPricing,
  };
}
