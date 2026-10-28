# 05 — Notifications: Email, SMS, Push

## Email architecture

- **Layout**: the `email_layout` table stores the global HTML header and footer, editable
  in Admin → Settings → Notifications (`EmailLayoutEditor.tsx`).
- **Wrapper**: `supabase/functions/_shared/email-wrapper.ts` wraps any body HTML in that
  header/footer. **Every** outbound email must go through it — templates store body-only
  HTML.
- **Templates**: `email_templates` (transactional) and `marketing_templates` (campaigns),
  both editable in Admin.
- **Sender**: Resend. Absolute URLs only — relative links break in mail clients. Anton
  headings, Inter body, brand colours inline.

## SMS

`sms_templates` table, managed in Admin → Settings → Notifications alongside email
templates (they were deliberately consolidated into one area). Ad-hoc sends are logged in
`adhoc_sms_log`.

## Merge tags

Templates support merge tags substituted at send time. The important non-obvious one:

- `{staffed_status}` — resolves against `staffed_hours` for the booking's start time and
  selects the staffed vs unstaffed variant of a template.

## Notification variants

`send-booking-notification` picks a variant using two signals:

1. Is this the customer's **first** booking?
2. Does the session start inside **staffed hours**?

The **first-time booking during unstaffed hours** variants (email and SMS) put the venue
phone number front and centre and tell the customer to read the Quick Start guide in the
bay and call if anything goes wrong.

Sent notifications are recorded in `booking_notification_log` to prevent duplicates.

## Transactional email functions

`send-welcome-email`, `send-password-reset`, `send-deposit-notification`,
`send-feedback-request`, `send-league-winner-email`, `send-winner-reminder`,
`send-loyalty-reminder`, `send-payment-retry-warning`, `send-membership-hold-email`,
`send-gate-access-request`, `send-byo-alert`, `notify-bad-feedback`,
`send-questionnaire-submission`, `issue-gift-card`, `issue-admin-gift-card`.

Note: gift cards have **two** templates — the customer-purchased "from a friend" version
(`issue-gift-card`) and the internally-issued "you've been issued a gift card" version
(`issue-admin-gift-card`).

The league onboarding email (`league_welcome` template) includes an "Important Rules"
card: take a Sim Drop from the rough via Shot Options, and a note that handicapping is
imperfect — have fun.

## Announcements and push

- `announcements` + `announcement_reads` power in-app notifications
  (`NotificationBell.tsx`). URLs in announcement text are auto-parsed into brand-orange
  anchor tags.
- `push_tokens` + `send-push-notification` handle mobile push (FCM v1 on Android, APNs on
  iOS) via Capacitor (`src/hooks/usePushNotifications.ts`).
- Watched-customer alerts notify staff in real time when specific monitored email
  addresses make a booking.

## Marketing

Marketing and bulk emails include a signed, recipient-specific unsubscribe link in the saved global footer. The public `/unsubscribe` page needs no login; the same endpoint accepts standard one-click POST requests. Previously delivered tokens remain valid. Admin Customer Profile has a manual unsubscribe action, authorized server-side with `has_role`. Opt-out sets `profiles.marketing_opt_out` and records the normalized address in `marketing_unsubscribes` (no profile_id column). Both senders recheck these suppression sources before sending. Booking confirmations, password resets and other service emails remain unchanged.

`marketing_campaigns`, `marketing_unsubscribes`, `send-marketing-email`,
`send-bulk-email`, `marketing-unsubscribe`. Automated programmes:

- **First Session Free** promo — credit issued and tracked in `deposit_transactions`.
- **Visitor loyalty** — $35 credit after a visitor's 5th confirmed booking.
- **First session feedback** — survey emailed 24 hours after a first booking (cron).
- **Google review rewards** — $15 credit approved in Admin → Review Approvals.

When batching recipients, always use `.range()` chunking with correct offsets — an
off-by-one in chunked fetching once silently skipped months of promo emails.
