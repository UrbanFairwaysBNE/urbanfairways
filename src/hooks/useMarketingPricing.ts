import { usePricing } from "@/hooks/usePricing";
import { useCasualRates } from "@/hooks/useCasualRates";
import { offPeakLines, peakLines } from "@/lib/pricing-utils";
import type { TierConfig } from "@/lib/tier-config";

export interface MarketingTier {
  key: string;
  name: string;
  /** Weekly subscription price, e.g. "$29" */
  price: string;
  /** Member hourly rate, e.g. "$10/hr" */
  rate: string;
  tag: string;
  badge: string | null;
  perks: string[];
  highlight: boolean;
  /** Rendered as a muted/dashed card and pulled out of the main grid. */
  subtle: boolean;
  info: string | null;
}

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function toMarketingTier(t: TierConfig): MarketingTier {
  return {
    key: t.tier,
    name: t.display_name,
    price: t.weekly_subscription_price != null ? money(t.weekly_subscription_price) : "—",
    rate: `${money(t.hourly_rate)}/hr`,
    tag: t.marketing_tag ?? t.description ?? "",
    badge: t.marketing_badge,
    perks: t.features,
    highlight: t.is_highlighted,
    subtle: t.requires_verification,
    info: t.marketing_note,
  };
}

/**
 * Single source of truth for every public pricing surface (website homepage,
 * membership page and the in-app membership screen). Everything is read from
 * `pricing_config` / `pricing_specials` — nothing here is hardcoded.
 */
export function useMarketingPricing() {
  const { memberTiers, isLoading: tiersLoading } = usePricing();
  const { peakLabel, offPeakLabel, specials, isLoading: casualLoading } = useCasualRates();

  const visible = memberTiers
    .filter((t) => t.show_on_marketing)
    .sort((a, b) => a.display_order - b.display_order)
    .map(toMarketingTier);

  return {
    /** Standard tiers shown in the main grid. */
    tiers: visible.filter((t) => !t.subtle),
    /** Verification-gated tiers (e.g. Frontline), shown on their own row. */
    restrictedTiers: visible.filter((t) => t.subtle),
    peakLabel,
    offPeakLabel,
    offPeakLines: offPeakLines(),
    peakLines: peakLines(),
    specials,
    isLoading: tiersLoading || casualLoading,
  };
}
