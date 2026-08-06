# 01 — Booking Engine

## Data model

| Table | Purpose |
| --- | --- |
| `bays` | Physical bays (`bay_number`, name, active). Bay count is data, not code. |
| `bookings` | Core booking rows: user, bay, start/end, status, price, payment refs, notes |
| `bay_blocks` | Staff-created blocks that make a bay unbookable for a window |
| `pricing_config` | Per-tier hourly rate, weekly subscription price, Stripe product/price IDs |
| `operating_hours` | Per-weekday open/close — controls the bookable timetable |
| `staffed_hours` | Per-weekday staffed window — drives notification variants |
| `public_holidays` | Dates treated as peak / special hours |
| `deposit_transactions` | Credit ledger (promos, refunds, gift cards, loyalty) |
| `booking_notification_log` | Sent-notification audit, prevents duplicates |

Primary hook: `src/hooks/useBooking.ts`. Pricing helpers: `src/lib/pricing-utils.ts` and
`src/hooks/usePricing.ts`. Hours: `src/hooks/useOperatingHours.ts`.

## Availability rules

- Slot grid is 30 minutes; minimum booking 1 hour, maximum 4 hours.
- The grid is generated from `operating_hours` for the selected weekday
  (Birdies default 5:00am–11:00pm) minus existing bookings and `bay_blocks`.
- **See-through logic**: a user's own `pending` bookings do not block them. Stale pending
  rows are cleaned up so an abandoned checkout never locks a slot.
- Availability query uses a SEMI_STATIC cache (`staleTime` ~5 minutes) — a deliberate
  trade-off between UX snappiness and status-change visibility. See `src/lib/query-keys.ts`.

## Pricing

- Casual: peak and off-peak rates.
- Off-peak window: Mon–Fri 5:30am–4:00pm and Sat–Sun 5:30am–10:00am (venue timezone).
  Everything outside that, plus public holidays, is peak.
- Members: flat discounted hourly rate by tier; Weekday members are restricted to
  weekdays before 4pm.
- Members booking an additional peak bay pay a surcharge rate.
- All rates come from `pricing_config`; `src/types/booking.ts` holds a fallback map only.

## Payment flow

1. Booking row created as `pending`.
2. Payment via saved card (`create-setup-intent`, `get-payment-methods`,
   `useSavedCard`) or Stripe Checkout.
3. `charge-booking` / `verify-booking-payment` confirm and flip status to `confirmed`.
4. Deposit balance (credits) is applied before card charge; partial credit is supported and
   every movement is written to `deposit_transactions`.

Duplicate payments and payments for deleted bookings are auto-refunded with reason
`duplicate` (`refund-booking`). Charges use idempotency buckets so a retry cannot
double-charge; checkout identifiers include a random UUID suffix so a customer can retry
immediately after a failure.

## Reschedule, cancel, extend

- `reschedule-booking` and `cancel-booking` **refuse once a booking is live** — defined as
  10 minutes past its start time. The same guard is enforced in the UI
  (`src/pages/MyBookings.tsx`, `RescheduleDialog.tsx`).
- `extend-booking` + `src/components/booking/ExtendDialog.tsx` let a customer add time
  mid-session if the bay is free. The Bay Controller's end-of-session screens show a QR
  code that deep-links to My Bookings for exactly this.

## Admin timetable

`src/pages/admin/AdminTimetable.tsx` is the operational hub: drag-free grid of bays ×
time, click a booking to open details, add bookings (`AddBookingDialog`), block bays,
record internal staff notes (marked with a speech-bubble icon), and log first-time
customers' referral source (`profiles.referral_source`, surfaced in Admin Analytics).

## Notifications on booking

`send-booking-notification` sends email + SMS on confirm/reschedule/cancel. It selects a
template variant based on whether the session falls inside `staffed_hours` and whether it
is the customer's first booking — see `05-NOTIFICATIONS.md`.
