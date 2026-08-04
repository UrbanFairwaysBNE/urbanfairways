/**
 * Tenant (venue) configuration for edge functions.
 *
 * Reads the single `tenant_settings` row with the service role, falling back to
 * environment variables and then to neutral placeholders. Never hardcode a
 * venue domain, phone number or email address in a function.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

export interface TenantConfig {
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
  timezone: string;
  socials: Record<string, string>;
}

const env = (key: string, fallback: string) => Deno.env.get(key) || fallback;

const defaults = (): TenantConfig => ({
  venue_name: env("TENANT_VENUE_NAME", "Your Venue"),
  legal_entity: env("TENANT_LEGAL_ENTITY", ""),
  abn: env("TENANT_ABN", ""),
  booking_domain: env("TENANT_BOOKING_DOMAIN", "example.com"),
  hub_domain: env("TENANT_HUB_DOMAIN", "hub.example.com"),
  support_phone: env("TENANT_SUPPORT_PHONE", ""),
  support_email: env("TENANT_SUPPORT_EMAIL", "info@example.com"),
  sender_email: env("TENANT_SENDER_EMAIL", "noreply@example.com"),
  admin_alert_email: env("TENANT_ADMIN_ALERT_EMAIL", "admin@example.com"),
  address_line: "",
  suburb: "",
  state: "",
  postcode: "",
  timezone: env("TENANT_TIMEZONE", "Australia/Brisbane"),
  socials: {},
});

let cached: TenantConfig | null = null;

export async function getTenant(): Promise<TenantConfig> {
  if (cached) return cached;

  const base = defaults();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await supabase
      .from("tenant_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    cached = data
      ? { ...base, ...data, socials: (data.socials as Record<string, string>) ?? {} }
      : base;
  } catch (_e) {
    cached = base;
  }

  return cached;
}

export const tenantBookingUrl = (t: TenantConfig, path = "/") =>
  `https://${t.booking_domain}${path.startsWith("/") ? path : `/${path}`}`;

export const tenantHubUrl = (t: TenantConfig, path = "/") =>
  `https://${t.hub_domain}${path.startsWith("/") ? path : `/${path}`}`;

export const tenantAddress = (t: TenantConfig) =>
  [t.address_line, t.suburb, [t.state, t.postcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
