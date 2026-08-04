// Membership tier metadata is entirely database-driven (`pricing_config`).
// No tier keys, rates or names are hardcoded anywhere in the app: a fresh
// venue starts with zero tiers and configures them in Admin → Pricing.

export interface TierConfig {
  id?: string;
  tier: string;
  display_name: string;
  hourly_rate: number;
  off_peak_hourly_rate: number | null;
  weekly_subscription_price: number | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  display_order: number;
  is_subscription: boolean;
  description: string | null;
  features: string[];
  restrictions: string | null;
  restricted_to_off_peak: boolean;
  grants_league_access: boolean;
  grants_range_access: boolean;
  single_bay_at_peak: boolean;
  is_default: boolean;
}

/** Columns to select when loading tiers from `pricing_config`. */
export const TIER_SELECT =
  "id, tier, display_name, hourly_rate, off_peak_hourly_rate, weekly_subscription_price, stripe_product_id, stripe_price_id, display_order, is_subscription, description, features, restrictions, restricted_to_off_peak, grants_league_access, grants_range_access, single_bay_at_peak, is_default";

/** Normalise a raw `pricing_config` row into a TierConfig. */
export function normaliseTier(row: Record<string, unknown>): TierConfig {
  const features = Array.isArray(row.features)
    ? (row.features as unknown[]).map((f) => String(f))
    : [];
  return {
    id: row.id as string | undefined,
    tier: String(row.tier ?? ""),
    display_name: String(row.display_name ?? row.tier ?? ""),
    hourly_rate: Number(row.hourly_rate ?? 0),
    off_peak_hourly_rate:
      row.off_peak_hourly_rate === null || row.off_peak_hourly_rate === undefined
        ? null
        : Number(row.off_peak_hourly_rate),
    weekly_subscription_price:
      row.weekly_subscription_price === null || row.weekly_subscription_price === undefined
        ? null
        : Number(row.weekly_subscription_price),
    stripe_product_id: (row.stripe_product_id as string | null) ?? null,
    stripe_price_id: (row.stripe_price_id as string | null) ?? null,
    display_order: Number(row.display_order ?? 0),
    is_subscription: !!row.is_subscription,
    description: (row.description as string | null) ?? null,
    features,
    restrictions: (row.restrictions as string | null) ?? null,
    restricted_to_off_peak: !!row.restricted_to_off_peak,
    grants_league_access: !!row.grants_league_access,
    grants_range_access: !!row.grants_range_access,
    single_bay_at_peak: !!row.single_bay_at_peak,
    is_default: !!row.is_default,
  };
}

export function findTier(tiers: TierConfig[], key?: string | null): TierConfig | undefined {
  if (!key) return undefined;
  const needle = key.toLowerCase();
  return tiers.find((t) => t.tier.toLowerCase() === needle);
}

/**
 * The walk-in / non-member tier. Explicitly flagged with `is_default`, else the
 * cheapest-ordered non-subscription tier. Returns undefined when unconfigured.
 */
export function getDefaultTier(tiers: TierConfig[]): TierConfig | undefined {
  return (
    tiers.find((t) => t.is_default) ??
    [...tiers].sort((a, b) => a.display_order - b.display_order).find((t) => !t.is_subscription)
  );
}

/** True when the tier key is the venue's walk-in tier (or unknown/unconfigured). */
export function isDefaultTier(tiers: TierConfig[], key?: string | null): boolean {
  const tier = findTier(tiers, key);
  if (!tier) return true;
  return tier.tier === getDefaultTier(tiers)?.tier;
}

/** Human label for a tier key, falling back to the raw key. */
export function tierLabel(tiers: TierConfig[], key?: string | null): string {
  if (!key) return "";
  return findTier(tiers, key)?.display_name || key;
}

export function grantsLeagueAccess(tiers: TierConfig[], key?: string | null): boolean {
  return !!findTier(tiers, key)?.grants_league_access;
}

export function grantsRangeAccess(tiers: TierConfig[], key?: string | null): boolean {
  return !!findTier(tiers, key)?.grants_range_access;
}

/** Tier is limited to off-peak times at its member rate. */
export function isOffPeakOnlyTier(tiers: TierConfig[], key?: string | null): boolean {
  return !!findTier(tiers, key)?.restricted_to_off_peak;
}

/** Tier's member rate only applies to one bay at a time during peak. */
export function hasSingleBayPeakLimit(tiers: TierConfig[], key?: string | null): boolean {
  return !!findTier(tiers, key)?.single_bay_at_peak;
}

/** Subscription tiers, ordered for display. */
export function subscriptionTiers(tiers: TierConfig[]): TierConfig[] {
  return tiers
    .filter((t) => t.is_subscription && !t.is_default)
    .sort((a, b) => a.display_order - b.display_order);
}

/** Every tier key that is a paid membership (i.e. not the walk-in tier). */
export function memberTierKeys(tiers: TierConfig[]): string[] {
  return subscriptionTiers(tiers).map((t) => t.tier);
}
