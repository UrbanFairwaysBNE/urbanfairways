# 03 — Memberships and Billing

## Tiers

Defined in `pricing_config` (source of truth) with a fallback map in
`src/types/booking.ts`. Birdies configuration:

| Tier | Weekly | Hourly | Notes |
| --- | --- | --- | --- |
| Visitor | $0 | $35 peak / $25 off-peak | Pay as you play |
| Weekday | $15 | $10 | Weekdays before 4pm only |
| Birdie | $27 | $10 | Anytime, league access |
| Eagle | $35 | $8 | Anytime, league access, priority booking |

Stripe API version: `2025-07-30.basil`. Currency AUD, weekly recurring interval.

## Signup

`create-membership-checkout` creates the subscription. Rules:

- **Charged immediately** — no trials, no trial coupons.
- A tier is only applied to the profile when Stripe reports status `active`
  (via webhook), never optimistically on redirect.
- Google/social sign-in is supported; anonymous sign-ups are disabled.

## Switching tiers

Never create a second subscription. `create-membership-checkout` detects an existing
active subscription and calls `stripe.subscriptions.update()` with:

- proration enabled, so the customer is charged/credited the difference
- `billing_cycle_anchor: "unchanged"`, so the weekly cycle does not reset

This exists because a customer once held two concurrent subscriptions and was billed
twice in two days.

## Payment failures

A deliberate two-strike ladder (customer-friendly by design):

1. **First failure** — cancel and refund any future bookings, set
   `profiles.payment_failed_at`, force Visitor pricing (they can still book at $35), send a
   heads-up email. Customer can self-serve retry via `MembershipPaymentIssueDialog`
   (`retry-membership-payment`).
2. **Second failure** — downgrade to Visitor and void the invoice so Stripe stops retrying.

On `invoice.payment_succeeded` the flag is cleared and member pricing is restored.

Related functions: `send-payment-retry-warning`, `send-membership-hold-email`,
`toggle-membership-hold`, `cancel-membership`, `sync-membership-payments`,
`sync-subscription-payment-method`.

## Webhooks

`stripe-webhook` has `verify_jwt = false`. Every event id is recorded in
`stripe_processed_events` **before** processing and short-circuits on replay — this is the
global idempotency guard that stopped duplicate cancellation emails.

Subscription IDs sometimes arrive nested on the invoice; the handler has a fallback path
for both shapes.

## Audit trail

Complimentary memberships are assigned from Customers → customer three-dot menu → Assign Complimentary Membership. The admin-only function assigns an existing subscription tier and enables custom billing without creating a Stripe subscription. Existing subscriptions or open membership checkouts must be cancelled first; the grant never silently leaves recurring billing active. Custom-billing profiles cannot start self-service membership checkout. Profile tier and custom-billing writes are protected from non-admin callers. Session charges remain governed by the selected tier's rates; tier transitions still use the existing audit trigger.

- `membership_changes` — every tier transition, written by the
  `trg_log_membership_tier_change` trigger.
- `membership_payments` — payment history.
- Admin → Members shows Net New (green), Returning (blue) and Lost (red), deduplicating
  customers who bounce in and out within a week.

## Pricing changes

`update-pricing` creates a new Stripe price, archives the old one, updates
`pricing_config`, and optionally migrates existing subscribers with
`proration_behavior: "none"` so the new rate applies at the next billing date.
