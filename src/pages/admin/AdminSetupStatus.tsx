import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MinusCircle, ArrowRight } from "lucide-react";
import { TENANT_DEFAULTS, useTenant } from "@/config/tenant";

type CheckState = "ok" | "missing" | "optional-missing";

interface Check {
  label: string;
  detail: string;
  state: CheckState;
  fixLabel: string;
  fixTo: string;
  optional?: boolean;
}

interface CheckGroup {
  title: string;
  description: string;
  checks: Check[];
}

const SETTINGS = (tab: string) => `/admin/settings?tab=${tab}`;

function stateOf(ok: boolean, optional?: boolean): CheckState {
  if (ok) return "ok";
  return optional ? "optional-missing" : "missing";
}

async function fetchSetupData() {
  const [
    pricing,
    bays,
    hours,
    emailTemplates,
    smsTemplates,
    doorSettings,
    posProducts,
    pushTokens,
  ] = await Promise.all([
    supabase.from("pricing_config").select("id, tier_name, is_default, stripe_price_id"),
    supabase.from("bays").select("id, is_active"),
    supabase.from("operating_hours").select("day_of_week, is_open"),
    supabase.from("email_templates").select("id, template_type, is_active"),
    supabase.from("sms_templates").select("id, template_type, is_active"),
    supabase.from("door_access_settings").select("*").limit(1).maybeSingle(),
    supabase.from("pos_products").select("id"),
    supabase.from("push_tokens").select("id"),
  ]);

  return {
    pricing: pricing.data ?? [],
    bays: bays.data ?? [],
    hours: hours.data ?? [],
    emailTemplates: emailTemplates.data ?? [],
    smsTemplates: smsTemplates.data ?? [],
    doorSettings: doorSettings.data as Record<string, unknown> | null,
    posProducts: posProducts.data ?? [],
    pushTokens: pushTokens.data ?? [],
  };
}

async function fetchSecretStatus() {
  const { data, error } = await supabase.functions.invoke("setup-status");
  if (error) throw error;
  return (data?.secrets ?? {}) as Record<string, boolean>;
}

export default function AdminSetupStatus() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();

  const dataQuery = useQuery({
    queryKey: ["setup-status-data"],
    queryFn: fetchSetupData,
    enabled: isAdmin,
  });

  const secretsQuery = useQuery({
    queryKey: ["setup-status-secrets"],
    queryFn: fetchSecretStatus,
    enabled: isAdmin,
    retry: false,
  });

  const groups: CheckGroup[] = useMemo(() => {
    const d = dataQuery.data;
    const s = secretsQuery.data ?? {};
    const has = (key: string) => s[key] === true;

    const venueMissing: string[] = [];
    const requiredVenue: [keyof typeof TENANT_DEFAULTS, string][] = [
      ["venue_name", "Venue name"],
      ["legal_entity", "Legal entity"],
      ["booking_domain", "Booking domain"],
      ["hub_domain", "Hub domain"],
      ["support_phone", "Support phone"],
      ["support_email", "Support email"],
      ["sender_email", "Sender email"],
      ["address_line", "Street address"],
      ["suburb", "Suburb"],
      ["state", "State"],
      ["postcode", "Postcode"],
    ];
    for (const [key, label] of requiredVenue) {
      const value = String(tenant[key] ?? "").trim();
      const isDefault = value === String(TENANT_DEFAULTS[key] ?? "").trim() && value !== "";
      if (!value || isDefault) venueMissing.push(label);
    }

    const tiers = d?.pricing ?? [];
    const defaultTier = tiers.find((t) => (t as { is_default?: boolean }).is_default);
    const tiersWithPrice = tiers.filter((t) => (t as { stripe_price_id?: string }).stripe_price_id);
    const activeBays = (d?.bays ?? []).filter((b) => (b as { is_active?: boolean }).is_active);
    const openDays = (d?.hours ?? []).filter((h) => (h as { is_open?: boolean }).is_open);
    const activeEmail = (d?.emailTemplates ?? []).filter((t) => (t as { is_active?: boolean }).is_active);
    const activeSms = (d?.smsTemplates ?? []).filter((t) => (t as { is_active?: boolean }).is_active);
    const door = d?.doorSettings as { enabled?: boolean; provider?: string } | null;

    return [
      {
        title: "Venue",
        description: "Identity, contact details and domains used across the site, emails and legal pages.",
        checks: [
          {
            label: "Venue details complete",
            detail: venueMissing.length
              ? `Still to fill in: ${venueMissing.join(", ")}`
              : `Configured for ${tenant.venue_name}`,
            state: stateOf(venueMissing.length === 0),
            fixLabel: "Venue details",
            fixTo: SETTINGS("general"),
          },
          {
            label: "Bays",
            detail: activeBays.length
              ? `${activeBays.length} active bay${activeBays.length === 1 ? "" : "s"}`
              : "No active bays — customers cannot book",
            state: stateOf(activeBays.length > 0),
            fixLabel: "Bays",
            fixTo: SETTINGS("general"),
          },
          {
            label: "Operating hours",
            detail: openDays.length
              ? `${openDays.length} of 7 days open`
              : "No open days configured",
            state: stateOf(openDays.length > 0),
            fixLabel: "Hours",
            fixTo: SETTINGS("general"),
          },
        ],
      },
      {
        title: "Pricing & payments",
        description: "Tiers, rates and the Stripe keys that let customers pay.",
        checks: [
          {
            label: "Pricing tiers",
            detail: tiers.length
              ? `${tiers.length} tier${tiers.length === 1 ? "" : "s"} configured`
              : "No tiers — booking and membership checkout are unavailable",
            state: stateOf(tiers.length > 0),
            fixLabel: "Pricing",
            fixTo: SETTINGS("pricing"),
          },
          {
            label: "Default (visitor) tier",
            detail: defaultTier
              ? `Default tier: ${(defaultTier as { tier_name?: string }).tier_name}`
              : "Mark exactly one tier as the default for non-members",
            state: stateOf(Boolean(defaultTier)),
            fixLabel: "Pricing",
            fixTo: SETTINGS("pricing"),
          },
          {
            label: "Membership Stripe prices",
            detail: tiersWithPrice.length
              ? `${tiersWithPrice.length} tier${tiersWithPrice.length === 1 ? "" : "s"} linked to a Stripe price`
              : "No paid tier is linked to a Stripe price yet",
            state: stateOf(tiersWithPrice.length > 0, true),
            optional: true,
            fixLabel: "Pricing",
            fixTo: SETTINGS("pricing"),
          },
          {
            label: "Stripe secret key",
            detail: has("STRIPE_SECRET_KEY")
              ? "STRIPE_SECRET_KEY is set"
              : "Add STRIPE_SECRET_KEY — no payments can be taken without it",
            state: stateOf(has("STRIPE_SECRET_KEY")),
            fixLabel: "Backend secrets",
            fixTo: SETTINGS("general"),
          },
          {
            label: "Stripe webhook secret",
            detail: has("STRIPE_WEBHOOK_SECRET")
              ? "STRIPE_WEBHOOK_SECRET is set"
              : "Add STRIPE_WEBHOOK_SECRET — memberships never activate without it",
            state: stateOf(has("STRIPE_WEBHOOK_SECRET")),
            fixLabel: "Backend secrets",
            fixTo: SETTINGS("general"),
          },
          {
            label: "In-venue card reader",
            detail: has("STRIPE_TERMINAL_READER_ID")
              ? "STRIPE_TERMINAL_READER_ID is set"
              : "Optional — only needed for tap-to-pay at the POS",
            state: stateOf(has("STRIPE_TERMINAL_READER_ID"), true),
            optional: true,
            fixLabel: "POS",
            fixTo: SETTINGS("pos"),
          },
          {
            label: "POS products",
            detail: (d?.posProducts ?? []).length
              ? `${(d?.posProducts ?? []).length} product${(d?.posProducts ?? []).length === 1 ? "" : "s"}`
              : "Optional — add food and drink items to sell at the POS",
            state: stateOf((d?.posProducts ?? []).length > 0, true),
            optional: true,
            fixLabel: "POS",
            fixTo: SETTINGS("pos"),
          },
        ],
      },
      {
        title: "Email & SMS",
        description: "Transactional messaging for bookings, memberships and staff alerts.",
        checks: [
          {
            label: "Email sending (Resend)",
            detail: has("RESEND_API_KEY")
              ? "RESEND_API_KEY is set"
              : "Add RESEND_API_KEY and verify your sending domain",
            state: stateOf(has("RESEND_API_KEY")),
            fixLabel: "Notifications",
            fixTo: SETTINGS("notifications"),
          },
          {
            label: "Sender domain matches venue",
            detail: tenant.sender_email && tenant.sender_email !== TENANT_DEFAULTS.sender_email
              ? `Sending as ${tenant.sender_email}`
              : "Set a sender email on your own verified domain",
            state: stateOf(
              Boolean(tenant.sender_email) && tenant.sender_email !== TENANT_DEFAULTS.sender_email,
            ),
            fixLabel: "Venue details",
            fixTo: SETTINGS("general"),
          },
          {
            label: "Email templates",
            detail: activeEmail.length
              ? `${activeEmail.length} active template${activeEmail.length === 1 ? "" : "s"}`
              : "No active email templates",
            state: stateOf(activeEmail.length > 0),
            fixLabel: "Notifications",
            fixTo: SETTINGS("notifications"),
          },
          {
            label: "SMS gateway",
            detail: has("SMS_BROADCAST_USERNAME") && has("SMS_BROADCAST_PASSWORD")
              ? "SMS credentials are set"
              : "Optional — add SMS Broadcast credentials to send booking and gate-code texts",
            state: stateOf(has("SMS_BROADCAST_USERNAME") && has("SMS_BROADCAST_PASSWORD"), true),
            optional: true,
            fixLabel: "Notifications",
            fixTo: SETTINGS("notifications"),
          },
          {
            label: "SMS templates",
            detail: activeSms.length
              ? `${activeSms.length} active template${activeSms.length === 1 ? "" : "s"}`
              : "Optional — activate SMS templates once the gateway is connected",
            state: stateOf(activeSms.length > 0, true),
            optional: true,
            fixLabel: "Notifications",
            fixTo: SETTINGS("notifications"),
          },
        ],
      },
      {
        title: "Optional integrations",
        description: "Enable these only if the venue uses the matching hardware or service.",
        checks: [
          {
            label: "League (SGT)",
            detail: has("SGT_API_KEY") && has("SGT_CLUB_URL")
              ? "SGT credentials are set"
              : "Optional — required only for Simulator Golf Tour league sync",
            state: stateOf(has("SGT_API_KEY") && has("SGT_CLUB_URL"), true),
            optional: true,
            fixLabel: "SGT Manager",
            fixTo: "/admin/sgt",
          },
          {
            label: "Recordings & highlights (Cloudflare Stream)",
            detail: has("CLOUDFLARE_ACCOUNT_ID") && has("CLOUDFLARE_STREAM_API_TOKEN")
              ? "Cloudflare Stream is configured"
              : "Optional — needed for shot recording and highlight clips",
            state: stateOf(
              has("CLOUDFLARE_ACCOUNT_ID") && has("CLOUDFLARE_STREAM_API_TOKEN"),
              true,
            ),
            optional: true,
            fixLabel: "Highlights",
            fixTo: "/admin/highlights/exports",
          },
          {
            label: "Door access (Tuya)",
            detail: door?.enabled
              ? `Enabled — provider: ${door?.provider ?? "unknown"}`
              : has("TUYA_ACCESS_ID") && has("TUYA_ACCESS_SECRET")
                ? "Tuya credentials set, but door access is switched off"
                : "Optional — add Tuya credentials for automatic 6-digit door codes",
            state: stateOf(
              Boolean(door?.enabled) && has("TUYA_ACCESS_ID") && has("TUYA_ACCESS_SECRET"),
              true,
            ),
            optional: true,
            fixLabel: "Door access",
            fixTo: SETTINGS("general"),
          },
          {
            label: "Bay power control (Tapo)",
            detail: has("TAPO_EMAIL") && has("TAPO_PASSWORD")
              ? "Tapo credentials are set"
              : "Optional — needed for automated bay power on/off",
            state: stateOf(has("TAPO_EMAIL") && has("TAPO_PASSWORD"), true),
            optional: true,
            fixLabel: "Bay Control",
            fixTo: "/admin/bay-control",
          },
          {
            label: "Push notifications",
            detail:
              (has("APNS_KEY_ID") && has("APNS_TEAM_ID") && has("APNS_PRIVATE_KEY")) ||
              has("FIREBASE_SERVICE_ACCOUNT_JSON")
                ? `Configured${(d?.pushTokens ?? []).length ? ` — ${(d?.pushTokens ?? []).length} registered device(s)` : ""}`
                : "Optional — add Apple (APNS) or Firebase credentials for mobile push",
            state: stateOf(
              (has("APNS_KEY_ID") && has("APNS_TEAM_ID") && has("APNS_PRIVATE_KEY")) ||
                has("FIREBASE_SERVICE_ACCOUNT_JSON"),
              true,
            ),
            optional: true,
            fixLabel: "Announcements",
            fixTo: "/admin/announcements",
          },
        ],
      },
    ];
  }, [dataQuery.data, secretsQuery.data, tenant]);

  const isLoading = authLoading || tenantLoading || dataQuery.isLoading;

  const requiredChecks = groups.flatMap((g) => g.checks.filter((c) => !c.optional));
  const requiredDone = requiredChecks.filter((c) => c.state === "ok").length;
  const allReady = requiredChecks.length > 0 && requiredDone === requiredChecks.length;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) return null;

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
            Setup Status
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Everything this venue needs before going live. Fix the red rows first — amber rows
            are optional integrations.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Required checks</p>
              <p className="font-display text-2xl text-foreground">
                {requiredDone} / {requiredChecks.length}
              </p>
            </div>
            <Badge variant={allReady ? "default" : "destructive"}>
              {allReady ? "Ready to launch" : "Setup incomplete"}
            </Badge>
          </CardContent>
        </Card>

        {secretsQuery.isError && (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Could not read backend secret status. Secret-based rows below may show as missing.
            </CardContent>
          </Card>
        )}

        {groups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle className="text-lg">{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.checks.map((check) => (
                <div
                  key={check.label}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {check.state === "ok" ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                    ) : check.state === "missing" ? (
                      <XCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                    ) : (
                      <MinusCircle className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {check.label}
                        {check.optional && (
                          <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                            optional
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground break-words">{check.detail}</p>
                    </div>
                  </div>
                  {check.state !== "ok" && (
                    <Button asChild variant="outline" size="sm">
                      <Link to={check.fixTo}>
                        {check.fixLabel}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
