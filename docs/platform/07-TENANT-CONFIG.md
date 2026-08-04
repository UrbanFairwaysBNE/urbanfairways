# 07 — Tenant Configuration Inventory

Everything in this file is venue-specific. Use it as the checklist when de-branding
(`08-DEBRANDING-GUIDE.md`) and when standing up a client (`10-ONBOARDING-RUNBOOK.md`).

Status: this file reflects **BASELINE HUB** after de-branding Steps 1–8. Items that were
hardcoded in Birdies and are now database-driven have been moved into the first table.

## Already database-driven (no code changes needed)

| What | Where |
| --- | --- |
| Venue name, legal entity, ABN, address | `tenant_settings` (Admin → Settings → Venue Details) |
| Booking domain, Hub domain | `tenant_settings.booking_domain`, `hub_domain` |
| Support phone, support email, sender email, admin alert email | `tenant_settings` |
| Timezone, socials | `tenant_settings.timezone`, `socials` (jsonb) |
| Bays and bay names | `bays` |
| Pricing, tier metadata and Stripe price IDs | `pricing_config` (incl. `is_default`, `grants_league_access`, `grants_range_access`, `single_bay_at_peak`, `restricted_to_off_peak`) |
| Operating hours / staffed hours | `operating_hours`, `staffed_hours` |
| Public holidays | `public_holidays` |
| Email header/footer (with `{{venue_name}}`-style merge tokens) | `email_layout` |
| Email + SMS templates | `email_templates`, `sms_templates`, `marketing_templates` |
| POS products, table service | `pos_products`, `table_service_hours` |
| Door access rules | `door_access_settings` |
| SGT club credentials | `sgt_club_config`, `sgt_api_config` |
| Handicap and league settings | `sgt_handicap_settings`, `sgt_tour_settings`, `local_comp_settings` |
| Loyalty / promo settings | `loyalty_promo_settings` |
| Misc app settings | `system_settings` |

Read tenant values through `src/config/tenant.ts` (`useTenant()`) in the frontend and
`supabase/functions/_shared/tenant.ts` in edge functions. Never reintroduce a venue
literal in a component or function.

## Hardcoded — must be changed per venue

| Item | Location | Notes |
| --- | --- | --- |
| Brand colours + fonts | `src/index.css`, `tailwind.config.ts` | Baseline ships a neutral graphite/amber palette with neutral fonts; keep the token structure |
| Logos, poster imagery | `src/assets/venue-*`, `public/venue-welcome-logo.png`, `public/app-icon-1024.png`, `public/favicon.png`, `public/splash-portrait.png` | Baseline ships neutral placeholders |
| `public/quick-start-guide.html` | Quick Start guide | Rewrite per venue |
| Terms / privacy / media-consent text | `src/components/legal/TermsContent.tsx`, `src/pages/PrivacyPolicy.tsx` | Clause structure is generic and injects the venue name; bump `src/lib/terms-version.ts` when the wording changes materially |
| Capacitor app id + app name | `capacitor.config.ts`, `android/` | Still a literal — set per client before shipping mobile |
| `google-services.json` | `android/app/` | Not in Baseline; client supplies their own per Firebase project |
| Electron appId, productName, artifact name | `electron/package.json` | Baseline uses `com.example.baycontroller` / `Bay Controller` |
| Bay Controller release repo | `electron/package.json` publish block, `.github/workflows/build-electron.yml` | Baseline uses `your-org/bay-controller`; see `09-BAY-CONTROLLER-BUILD.md` |
| Bay Controller access password | Bay Controller UI | |
| Stripe products and price IDs | Created in Admin → Settings → Pricing | Baseline ships **no** tiers and no seeded price IDs — never reuse another venue's |

## Secrets to (re)create per project

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TERMINAL_READER_ID`,
`RESEND_API_KEY`, `SITE_URL`, `SYNC_SECRET`, SMS provider credentials
(`SMS_BROADCAST_USERNAME` / `_PASSWORD`), Cloudflare Stream account id + API token,
Tuya access id/secret, Tapo email/password, SGT username/password/API key/club URL,
Apple push (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`),
`FIREBASE_SERVICE_ACCOUNT_JSON`, Noke credentials if the venue has a gate.

Admin → **Setup Status** shows which of these are configured and which venue
configuration rows are still missing.

## Third-party accounts to create per client

Stripe, Resend (with verified domain), SMS provider, Cloudflare (Stream), Tuya IoT Cloud,
Tapo, Simulator Golf Tour club, Google Cloud/Firebase (push + OAuth), GitHub repo for the
Bay Controller releases, Google Play / Apple developer accounts if shipping mobile apps.
