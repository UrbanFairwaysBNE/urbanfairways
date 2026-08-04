import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePricing } from "@/hooks/usePricing";
import type { PricingSpecial } from "@/lib/pricing-utils";

/**
 * Casual (pay-as-you-go) rates for public marketing pages.
 * Peak/off-peak rates come from the venue's default walk-in tier in
 * `pricing_config`; deals come from `pricing_specials`. Never hardcode rates.
 */
export function useCasualRates() {
  const { peakRate, offPeakRate, isLoading: isLoadingTiers } = usePricing();
  const [specials, setSpecials] = useState<PricingSpecial[]>([]);
  const [isLoadingSpecials, setIsLoadingSpecials] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("pricing_specials")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (!active) return;
      if (error) {
        console.error("Error fetching pricing specials:", error);
      } else {
        setSpecials((data ?? []) as unknown as PricingSpecial[]);
      }
      setIsLoadingSpecials(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  /** "$55" style label, or null when pricing isn't configured yet. */
  const format = (rate: number): string | null =>
    rate > 0 ? `$${Number.isInteger(rate) ? rate : rate.toFixed(2)}` : null;

  return {
    peakRate,
    offPeakRate,
    peakLabel: format(peakRate),
    offPeakLabel: format(offPeakRate),
    specials,
    isLoading: isLoadingTiers || isLoadingSpecials,
  };
}
