# Coaching: PGA pros booking lessons

Adds coaches to the platform without touching the existing booking engine. A lesson is a normal booking with a coach flag and a linked client — same availability, overlap protection, payment, cancel and reschedule rules as any other booking.

## How it works

1. **Making a coach.** In Customers, the three-dot menu gains "Make Coach" / "Remove Coach", exactly like the corporate flow. A coach keeps their standard account.

2. **Coach pricing.** Custom rates become a pair — off-peak and peak — instead of today's single custom rate. The owner searches the coach in the customer overrides section and sets both. Coaches with only one rate set behave as they do today (that rate applies to all hours), so nothing existing breaks.

3. **Booking a lesson.** Coaches see a "Book a Lesson" card on their dashboard under Book a Bay. It reuses the exact bay booking screen with two differences: player count is locked to 1, and a searchable dropdown selects the client (must already have a UF account — no ad-hoc names). The coach pays the bay fee at their own off-peak/peak rate on their saved card; the lesson fee is settled privately.

4. **Where lessons appear.** In My Bookings for both people. The coach sees "Lesson with Jane Smith"; the client sees "Lesson with Coach Sam". Both get the normal cancel / reschedule / extend buttons under the existing rules (6-hour window, nothing once 10 minutes live). Whoever cancels, both sides get notified. In the admin timetable a lesson shows both names and a distinct badge.

5. **Notifications.** Lesson Booked, Lesson Rescheduled and Lesson Cancelled each get a coach-facing and a client-facing email template plus SMS, branded like the existing set and editable in Settings. The client's confirmation and reschedule emails carry a calendar invite attachment so it drops straight into their calendar; the coach's does too. Cancellations send a cancellation invite so the entry disappears from the calendar. Door codes keep working exactly as they do now — the client receives the code as normal, since they are the one arriving.

## Risks and how they are handled

- **Booking logic conflicts.** The plan adds columns and a notification branch only. No change to the overlap triggers, availability query, see-through pending logic, or the server-authoritative price ceiling. A lesson occupies a bay identically to any other booking, so double-booking is impossible.
- **Who is charged.** The booking is owned by the coach, so every existing payment, refund and payment-failure path already points at the right person with no special cases. The client is never charged and needs no card.
- **A client with no account.** Blocked by design — the dropdown only lists existing accounts. The coach gets a prompt to have the client sign up first.
- **Coach rate leaking to their own practice bookings.** Intended: the coach's custom rates apply to all their bookings, same as any other custom-rate customer today.
- **Calendar invites landing in spam.** Invites are attached to the existing branded email rather than sent as a bare invite, which is the safer deliverability route.

## Technical detail

**Migration**
- `profiles.is_coach boolean not null default false`.
- `profiles.custom_hourly_rate_peak numeric` added alongside the existing `custom_hourly_rate`, which is reinterpreted as the off-peak/base rate. Every read site falls back to `custom_hourly_rate` when the peak value is null, so current overrides keep working.
- `bookings.booking_type text not null default 'bay'` (`'bay' | 'lesson'`) and `bookings.client_user_id uuid` (nullable, references the client's profile user id).
- RLS: extend the bookings select policy so a user can read bookings where `client_user_id = auth.uid()`; insert of a lesson requires `is_coach` on the inserting user. Grants unchanged.

**Rate resolution**
- `calculateHourlyRate` in `src/lib/pricing-utils.ts` takes an optional peak custom rate and picks off-peak/peak by the existing `OFF_PEAK_WINDOWS`. Mirrored in `charge-booking`, `extend-booking`, `reschedule-booking` so the server ceiling stays authoritative.
- Admin overrides UI in `AdminSettings.tsx` and the `custom_hourly_rate` column in `AdminCustomers.tsx` become two fields.

**Frontend**
- `AdminCustomers.tsx`: Make Coach / Remove Coach action, coach badge, coach filter.
- `Dashboard.tsx`: coach-only "Book a Lesson" card.
- `Booking.tsx` accepts a `mode=lesson` state: player count locked to 1, client combobox (reusing `CustomerSearchCombobox`), lesson-specific summary copy. All availability, pricing and payment code paths untouched.
- `MyBookings.tsx`, `AdminTimetable.tsx`, `RescheduleDialog`, `ExtendDialog`: lesson labelling and the counterparty name.

**Notifications**
- `send-booking-notification` branches on `booking_type === 'lesson'` and sends two messages per event — client and coach — using six new templates in `email_templates` / `sms_templates` seeded through the existing branded wrapper.
- ICS generation added to `supabase/functions/_shared/` and attached via Resend for confirmation, reschedule (`METHOD:REQUEST`, incrementing `SEQUENCE`) and cancellation (`METHOD:CANCEL`), keyed on the booking id as UID.
- `booking_notification_log` keys gain the recipient side so the existing duplicate-send guard covers both messages independently.

**Out of scope for this pass**: client-initiated lesson requests, coach availability windows, and lesson-fee collection or payouts.
