# Finish the Chinese translation across the customer app

Right now only the dashboard, my bookings and my account are wired to the language switcher. Everything else — the booking flow, membership, sign in/sign up, UF Lab, clubhouse and league screens — still renders hardcoded English regardless of the selected language. This plan covers the remaining screens.

## What still needs translating

Booking (highest traffic)
- `Booking.tsx` — date/time picker, duration and bay selection, pricing summary, error and validation messages
- `DateTimePicker.tsx`, `BayAvailabilityGrid.tsx` — day names, slot labels, peak/off-peak badges, "unavailable"/"booked"
- `PaymentSheet.tsx`, `NoCardDialog.tsx` — payment copy, card prompts, buttons, toasts
- `RescheduleDialog.tsx`, `ExtendDialog.tsx` — cutoff notices, price lines, confirmations
- `BookingSuccess.tsx` — confirmation page, door code section, what-to-expect copy

Account and membership
- `Membership.tsx` — tier cards, perks, upgrade/downgrade and cancel flows
- `MembershipPaymentIssueDialog.tsx`, `FrontlineVerificationDialog.tsx`
- `PrepaidPacksCard.tsx`, `CorporateStaffCard.tsx` in My Account

Auth
- `AuthForm.tsx` — sign in, sign up, reset password, terms checkbox, all auth error toasts
- `ResetPassword.tsx`

Other customer screens
- `SwingLab.tsx` and `SwingLabProgress.tsx` (large — session stats, metric labels, empty states)
- `Clubhouse.tsx` — posts, comments, upvotes UI chrome (member-written post text stays as typed)
- `LeagueHub.tsx`, `LeagueRegister.tsx`, `LeagueRounds.tsx`, `LeagueProfile.tsx`, `LeagueLeaderboard.tsx`, `CompHub.tsx`, `CompRegisterTeam.tsx`, `CompLeaderboard.tsx`, `CompFindPartner.tsx`
- Shared chrome: app header/nav, notification bell, not-found page, terms content link

Also
- Dates and weekday names inside the booking calendar switch to the Chinese locale while still resolving in Brisbane time.

## Namespaces

Existing `common`, `account`, `dashboard`, `booking`, `membership`, `auth` are extended; new `lab`, `league`, `clubhouse` namespaces added so files stay reviewable.

## Build order

1. Booking flow end to end (Booking, pickers, payment sheet, success, reschedule, extend) — the screen you hit first after the dashboard.
2. Auth screens and membership + account sub-cards.
3. League and comp customer views.
4. UF Lab and Clubhouse.
5. Sweep for leftover toasts, dialogs and error strings; walk both languages through a full booking to confirm nothing falls back.

## Notes

- Anything untranslated keeps falling back to English rather than showing a raw key, so nothing breaks mid-rollout.
- Admin, SGT manager, bay controller screens and the marketing website stay English, as agreed.
- Presentation only — no change to pricing, booking, Stripe or bay controller logic.
