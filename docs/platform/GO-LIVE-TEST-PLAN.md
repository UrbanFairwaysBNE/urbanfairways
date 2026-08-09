# Go-Live Test Plan & Confidence Audit — Urban Fairways

Written 9 Aug 2026. Two parts:

1. **Confidence audit** — what I actually checked in this project's code and live
   backend, and where the risk sits.
2. **Test plan** — a prioritised script covering the things that will actually
   hurt you on the day, in the order you should run them.

The premise is right: the Birdies codebase is battle-tested logic. Almost every
failure at Urban Fairways will be a **configuration / data / credential** failure,
not a logic failure. So this plan spends most of its effort on config, and only
smoke-tests the logic that was already proven at Birdies.

---

## Part 1 — Confidence audit

### Confidence key

| Level | Meaning |
| --- | --- |
| HIGH | Logic proven at Birdies, config verified present here. Smoke test only. |
| MEDIUM | Logic proven, but config is venue-specific and unverified end-to-end. |
| LOW | Not configured, not connected, or changed since Birdies. Must be tested properly. |

### Findings

| Area | Confidence | Evidence / gap |
| --- | --- | --- |
| Bays, operating hours, staffed hours | HIGH | 7 active bays, 7 operating-hours rows, 7 staffed-hours rows present. |
| Tenant settings | HIGH | Fully populated (name, ABN, address, emails, socials, timezone). |
| Pricing tiers | HIGH | 5 tiers present, all 4 subscription tiers have Stripe price IDs, Casual is the default. |
| Prepaid packs | MEDIUM | 2 products with Stripe prices; purchase → lot → consume → refund path never run here. |
| Booking → payment → confirm | MEDIUM | Only 3 bookings exist in the whole database. The core path is essentially untested on this project. |
| Stripe webhooks | **LOW** | `stripe_processed_events` is **empty** and `membership_payments` is **empty**. No webhook event has ever been processed on this project. This is the single biggest risk. |
| Stripe live vs test mode | **LOW** | Keys are set but nothing has transacted. Confirm which mode the keys are in before you take a real payment. |
| Email sending | **LOW** | All functions send from `info@urbanfairways.com.au` (from `tenant_settings.sender_email`), but the sending domain configured was `send.urbanfairways.com.au`. If Resend has not verified the exact from-domain, **every email silently fails**. Verify before anything else. |
| Email/SMS templates | HIGH | 24 email templates, 4 SMS templates present and branded. |
| Door access | **LOW** | `door_access_settings.enabled = false`, provider = `manual`, mode = `daily`, fixed code `7675#`. Smart Padel integration is still an open decision. Booking emails will carry whatever this resolves to — if it's wrong, every customer is locked out. |
| Bay Controller | MEDIUM | Only **2 of 7** `bay_devices` rows exist. Bays 3–7 have no device record. |
| Tapo plugs | MEDIUM | Discovery/MAC binding is new code, not Birdies-proven. Your Mango bench covers this. |
| League (SGT) | **LOW** | `sgt_club_config`, `sgt_api_config`, tours, tournaments and members are **all empty**. The league is entirely unconfigured. |
| Scheduled jobs | **LOW** | Only **3 cron jobs** exist: pack expiry, daily door code, first-session promo. Missing vs Birdies: SGT sync / auto-register / auto-close, monthly standings, feedback requests, loyalty reminders, scheduled gift cards, stale-pending-booking cleanup, recording purge. These fail silently — nothing errors, things just never happen. |
| Public holidays | MEDIUM | Table is **empty**. Holidays are supposed to be peak — until populated, a public holiday bills at off-peak. |
| POS | **LOW** | `pos_products` is empty. Golf categories sync from pricing, but no retail/bar items exist. |
| Local comps | MEDIUM | Settings row exists; scoring/handicap flow not exercised here. |
| Corporate wallet | MEDIUM | New build (not from Birdies). Shared-wallet consumption and monthly caps unproven. |
| Gift cards | MEDIUM | No gift cards issued yet; auto-redeem-on-signup trigger untested here. |
| Admin access | MEDIUM | Exactly **1 admin** account exists. Add a second before go-live so you're not a single point of failure. |

### The five things most likely to ruin the day

1. **Emails not sending** (unverified from-domain) — customers get no confirmation
   and no door code.
2. **Stripe webhook not wired to this project** — payments succeed but memberships
   never activate and bookings never flip to confirmed.
3. **Door codes** — disabled/manual, so nobody can get in.
4. **Missing cron jobs** — silent, invisible failures for days.
5. **Bays 3–7 have no device rows** — no automation on five of seven bays.

---

## Part 2 — The test plan

### Phase 0 — Config sweep (do this a week out, not on the day)

Nothing here needs customers. Fix all of it before you test behaviour.

- [ ] Confirm the Resend sending domain matches `tenant_settings.sender_email` exactly. Send one test email and confirm delivery to a Gmail **and** an Outlook address.
- [ ] Confirm Stripe keys are live-mode (or deliberately test-mode for rehearsal).
- [ ] Point the Stripe webhook endpoint at this project and paste the new signing secret. Fire a test event and confirm a row lands in `stripe_processed_events`.
- [ ] Decide and configure door access (Smart Padel vs daily code). Set `enabled = true`.
- [ ] Create `bay_devices` rows for bays 3–7.
- [ ] Populate `public_holidays` for the next 12 months.
- [ ] Recreate the missing cron jobs (SGT sync/register/close, monthly standings, feedback requests, loyalty reminders, scheduled gift cards, stale-pending cleanup).
- [ ] Configure SGT club + API credentials, create the tour, run Test Connection.
- [ ] Add POS products (bar/retail).
- [ ] Add a second admin account.

### Phase 1 — Money path (highest priority, ~1 hour)

Run these as a **real customer account** on a phone, not as admin.

| # | Test | Pass condition |
| --- | --- | --- |
| 1.1 | Sign up new account, accept T&Cs | Profile created, welcome email received |
| 1.2 | Book a peak Casual hour, pay by card | Charged $55, booking `confirmed`, confirmation email + door code received |
| 1.3 | Book an off-peak Casual hour | Charged $40 |
| 1.4 | Save a card, then book using saved card | No re-entry of card details, charge succeeds |
| 1.5 | Join Birdie ($29/wk) | Charged immediately, tier appears on profile **only after** webhook, membership email names the tier |
| 1.6 | Book as Birdie | Charged $10/hr, not $55 |
| 1.7 | Switch Birdie → Eagle | **One** subscription in Stripe, prorated, billing date unchanged |
| 1.8 | Admin adds $50 credit, customer books a $40 slot | $40 from credit, $0 card, ledger row written |
| 1.9 | Book $55 slot with $20 credit | $20 credit + $35 card (partial payment) |
| 1.10 | Buy a 5hr Practice Pack | Pack lot created, balance shows in My Account |
| 1.11 | Book using pack hours | Hours deducted, balance correct |
| 1.12 | Cancel a future booking | Refunded to original method, cancellation email sent |
| 1.13 | Try to cancel a booking that started 15 min ago | Blocked with a clear message |
| 1.14 | Extend a live booking by 30 min | Charged correctly, bay end time moves, controller respects new end |

If 1.1–1.7 pass, you are 80% safe. These are the ones to run **before** opening day, with real money, and refund yourself.

### Phase 2 — Automation path (~1 hour, on site)

| # | Test | Pass condition |
| --- | --- | --- |
| 2.1 | Book a bay 5 minutes out, watch the controller | Hardware on at T−3m, apps launch T−1m |
| 2.2 | Let the session end | Apps close T−20s, plug off T+0 |
| 2.3 | Back-to-back bookings on one bay | No close, no power-off between them |
| 2.4 | Cancel a booking during PRE_START | No phantom launch, plug goes off |
| 2.5 | Reschedule to a different bay | Old bay powers down, new bay arms |
| 2.6 | Reboot a bay PC mid-session | Watchdog restarts, controller re-arms from cloud |
| 2.7 | Force DHCP churn (Mango bench) | Plug still controllable via MAC re-resolve |
| 2.8 | Repeat 2.1 on **all 7 bays** | Every bay behaves identically |

### Phase 3 — Access & comms (~30 min)

| # | Test | Pass condition |
| --- | --- | --- |
| 3.1 | Door code in confirmation email | Code actually opens the door at the booked time |
| 3.2 | Code outside the booking window | Does not work |
| 3.3 | Unstaffed-hours booking (after 23:00) | Correct unstaffed template variant sent |
| 3.4 | First-time customer booking | First-timer template variant sent |
| 3.5 | Cancellation / reschedule emails | Correct content, working links |

### Phase 4 — League & comps (can slip past go-live)

Only relevant once the league starts. Run a full dry week: register a player,
enter a scorecard, confirm handicap onboarding shows `(E)` for the first 4 rounds,
confirm Monday 6am auto-close and standings recalculation.

### Phase 5 — Admin & edge (~30 min)

- Admin timetable: add booking, block a bay, add internal note.
- Refund from admin, with and without notification.
- Membership payment failure: simulate a declined card, confirm the first-failure
  ladder (Casual pricing forced, heads-up email, self-serve retry works).
- Corporate account: create one, invite staff, confirm shared-wallet deduction and
  monthly cap, then remove corporate status and confirm staff are unlinked.

---

## Go-live day: what to actually watch

Keep three things open all day:

1. **Backend function logs** — filtered for errors on `charge-booking`,
   `stripe-webhook`, `send-booking-notification`.
2. **Stripe dashboard** — payments and subscription events in real time.
3. **Admin timetable** — any booking still sitting on `pending` after 2 minutes
   means the payment/confirm path broke.

Have a manual fallback ready for each critical system: a known-good door code, the
ability to power a bay on from the plug button, and the ability to confirm a
booking manually from admin. Every failure at Birdies was survivable because there
was a manual override — make sure there is one here too.

## Realistic sequencing

- **Two weeks out** — Phase 0 config sweep.
- **One week out** — Phase 1 with real money, refund yourself afterwards.
- **Three days out** — Phase 2 on site, all 7 bays.
- **Day before** — Phase 3 and 5.
- **Go-live day** — monitor only. Do not test new things on the day.
