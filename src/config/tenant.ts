import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tenant (venue) configuration.
 *
 * Single source of truth for venue-specific values. Never hardcode a venue
 * name, domain, phone number or email address in a component — read it from
 * here so a new venue is configured entirely through Admin → Settings.
 */
export interface TenantSettings {
  id?: string;
  venue_name: string;
  legal_entity: string;
  abn: string;
  booking_domain: string;
  hub_domain: string;
  support_phone: string;
  support_email: string;
  sender_email: string;
  admin_alert_email: string;
  address_line: string;
  suburb: string;
  state: string;
  postcode: string;
  /** Always an explicit IANA zone — see src/lib/brisbane-time.ts */
  timezone: string;
  socials: Record<string, string>;
}

/** Safe placeholders so a freshly remixed project renders without a configured row. */
export const TENANT_DEFAULTS: TenantSettings = {
  venue_name: "Your Venue",
  legal_entity: "",
  abn: "",
  booking_domain: "example.com",
  hub_domain: "hub.example.com",
  support_phone: "",
  support_email: "info@example.com",
  sender_email: "noreply@example.com",
  admin_alert_email: "admin@example.com",
  address_line: "",
  suburb: "",
  state: "",
  postcode: "",
  timezone: "Australia/Brisbane",
  socials: {},
};

export const TENANT_QUERY_KEY = ["tenant-settings"] as const;

export async function fetchTenantSettings(): Promise<TenantSettings> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return TENANT_DEFAULTS;

  const resolved: TenantSettings = {
    ...TENANT_DEFAULTS,
    ...data,
    socials: (data.socials as Record<string, string> | null) ?? {},
  };
  setTenantSnapshot(resolved);
  return resolved;
}

/** React hook — returns placeholders until the row loads. */
export function useTenant() {
  const query = useQuery({
    queryKey: TENANT_QUERY_KEY,
    queryFn: fetchTenantSettings,
    staleTime: 5 * 60 * 1000,
  });

  return {
    tenant: query.data ?? TENANT_DEFAULTS,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Full street address on one line, empty parts omitted. */
export function formatTenantAddress(t: TenantSettings): string {
  return [t.address_line, t.suburb, [t.state, t.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

/** Absolute https URL on the public booking domain. */
export function bookingUrl(t: TenantSettings, path = "/"): string {
  return `https://${t.booking_domain}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Absolute https URL on the hub domain. */
export function hubUrl(t: TenantSettings, path = "/"): string {
  return `https://${t.hub_domain}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ------------------------------------------------------------------ *
 * Sync snapshot access (for non-React modules: helpers, libs, utils)
 *
 * React code should use `useTenant()`. Plain modules that need a value
 * synchronously read `getTenantSnapshot()`, which returns the last loaded
 * row (or the placeholders until `fetchTenantSettings()` has resolved once).
 * ------------------------------------------------------------------ */
let snapshot: TenantSettings = TENANT_DEFAULTS;

export function setTenantSnapshot(t: TenantSettings) {
  snapshot = t;
}

export function getTenantSnapshot(): TenantSettings {
  return snapshot;
}

/** Loads the tenant row once and caches it into the sync snapshot. */
export async function loadTenantSnapshot(): Promise<TenantSettings> {
  try {
    const t = await fetchTenantSettings();
    setTenantSnapshot(t);
    return t;
  } catch {
    return snapshot;
  }
}
