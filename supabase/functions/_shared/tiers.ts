// Shared, fully data-driven membership tier helpers for edge functions.
// No tier key, name or rate is hardcoded: everything comes from `pricing_config`.

export interface TierRow {
  tier: string;
  display_name: string | null;
  hourly_rate: number;
  weekly_subscription_price: number | null;
  off_peak_hourly_rate: number | null;
  restricted_to_off_peak: boolean;
  single_bay_at_peak: boolean;
  grants_league_access: boolean;
  grants_range_access: boolean;
  is_subscription: boolean;
  is_default: boolean;
  requires_verification: boolean;
  display_order: number;
}

export const TIER_SELECT =
  "tier, display_name, hourly_rate, weekly_subscription_price, off_peak_hourly_rate, restricted_to_off_peak, single_bay_at_peak, grants_league_access, grants_range_access, is_subscription, is_default, requires_verification, display_order";

/** Load every configured tier. Returns [] for a venue with no pricing yet. */
export async function loadTiers(
  supabaseAdmin: { from: (t: string) => any },
): Promise<TierRow[]> {
  const { data } = await supabaseAdmin.from("pricing_config").select(TIER_SELECT);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    tier: String(r.tier ?? ""),
    display_name: (r.display_name as string | null) ?? null,
    hourly_rate: Number(r.hourly_rate ?? 0),
    off_peak_hourly_rate:
      r.off_peak_hourly_rate === null || r.off_peak_hourly_rate === undefined
        ? null
        : Number(r.off_peak_hourly_rate),
    restricted_to_off_peak: !!r.restricted_to_off_peak,
    single_bay_at_peak: !!r.single_bay_at_peak,
    grants_league_access: !!r.grants_league_access,
    grants_range_access: !!r.grants_range_access,
    is_subscription: !!r.is_subscription,
    is_default: !!r.is_default,
    requires_verification: !!r.requires_verification,
    display_order: Number(r.display_order ?? 0),
  }));
}

export function findTier(tiers: TierRow[], key?: string | null): TierRow | undefined {
  if (!key) return undefined;
  const needle = key.toLowerCase();
  return tiers.find((t) => t.tier.toLowerCase() === needle);
}

/** The walk-in tier: explicitly flagged, else the first non-subscription tier. */
export function defaultTier(tiers: TierRow[]): TierRow | undefined {
  return (
    tiers.find((t) => t.is_default) ??
    [...tiers].sort((a, b) => a.display_order - b.display_order).find((t) => !t.is_subscription)
  );
}

export function tierLabel(tiers: TierRow[], key?: string | null): string {
  if (!key) return "";
  return findTier(tiers, key)?.display_name || key;
}

export function memberTierKeys(tiers: TierRow[]): string[] {
  return tiers.filter((t) => t.is_subscription && !t.is_default).map((t) => t.tier);
}

function walkInRate(tiers: TierRow[], isPeak: boolean): number {
  const walkIn = defaultTier(tiers);
  if (!walkIn) return 0;
  if (isPeak) return Number(walkIn.hourly_rate);
  return Number(walkIn.off_peak_hourly_rate ?? walkIn.hourly_rate);
}

/**
 * Data-driven hourly rate for a tier at a given time.
 * - custom rate on the profile always wins
 * - off-peak-only tiers fall back to the walk-in peak rate during peak
 * - a tier with an off_peak_hourly_rate uses it off peak
 */
export function calculateTierHourlyRate(
  tiers: TierRow[],
  tierKey: string | null | undefined,
  isPeak: boolean,
  customHourlyRate: number | null,
): number {
  if (customHourlyRate !== null && customHourlyRate !== undefined && customHourlyRate > 0) {
    return customHourlyRate;
  }

  const tier = findTier(tiers, tierKey);
  if (!tier) return walkInRate(tiers, isPeak);

  if (tier.is_default) return walkInRate(tiers, isPeak);

  if (tier.restricted_to_off_peak && isPeak) {
    return walkInRate(tiers, true);
  }

  if (!isPeak && tier.off_peak_hourly_rate !== null) {
    return Number(tier.off_peak_hourly_rate);
  }

  return Number(tier.hourly_rate);
}

/**
 * Resolve a customer's custom rate override for a slot.
 * `custom_hourly_rate` is the off-peak/base override; `custom_hourly_rate_peak`
 * is the optional peak override. A single base rate applies to all hours.
 */
export function resolveCustomRate(
  customRate: number | null | undefined,
  customPeakRate: number | null | undefined,
  isPeak: boolean,
): number | null {
  if (isPeak && customPeakRate !== null && customPeakRate !== undefined && Number(customPeakRate) > 0) {
    return Number(customPeakRate);
  }
  if (customRate !== null && customRate !== undefined && Number(customRate) > 0) return Number(customRate);
  if (customPeakRate !== null && customPeakRate !== undefined && Number(customPeakRate) > 0) return Number(customPeakRate);
  return null;
}
