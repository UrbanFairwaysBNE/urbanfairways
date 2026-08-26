# Bilingual app: English / Chinese

Add a language switcher at the bottom of My Account so customers can run the app in English or Simplified Chinese, with their booking and membership emails/SMS sent in the same language.

## Complexity summary

Medium-large, but with no technical blockers. The plumbing is a day's work; the bulk of the effort is extracting and translating roughly 700–1,000 hardcoded strings across the customer app, plus producing Chinese versions of the notification templates.

Effort splits roughly:
- Framework + language switcher + preference storage: small
- String extraction across customer screens: large (the grind)
- Chinese notification templates: medium
- Ongoing: every new customer-facing string needs a Chinese counterpart or it silently falls back to English

## Scope

In scope:
- Customer app screens under `/app`: dashboard, booking flow, my bookings, my account, membership, UF Lab, league/comp customer views, auth (sign in / sign up / reset), payment sheets and dialogs, toasts and error messages.
- Transactional emails and SMS the customer receives (booking confirmed, reminder, cancellation, reschedule, extension, membership, lesson, gift card, door code).

Out of scope (stays English):
- Admin, SGT manager, bay controller and TV/embed screens
- The marketing website
- Admin-entered free text (What's On events, announcements, custom email edits)

## How it works

1. **Language preference**
   - New `profiles.preferred_language` column (`'en'` default, `'zh'`).
   - Signed-out users use a `localStorage` value; it is written to the profile on sign in.
   - Selector card at the bottom of My Account, above sign out: "Language / 语言" with English and 中文 options. Switching applies instantly.

2. **App translation**
   - Add `react-i18next`, initialised in a provider near the app root with `en` and `zh` resource files.
   - Strings extracted into namespaced JSON files (`booking`, `account`, `membership`, `league`, `common`, ...) so the files stay reviewable.
   - Dates, times and currency go through the existing Brisbane helpers with locale-aware formatting; no change to the underlying timezone rules.
   - Anything not yet translated falls back to English rather than showing a key.

3. **Emails and SMS**
   - Notification templates gain a language variant: each template row stores an optional Chinese subject/body alongside the English one.
   - Sending functions read the recipient's `preferred_language` and pick the Chinese variant when present, English otherwise.
   - Admin settings shows an English/中文 toggle per template so the client can edit either version, with the same live branded preview.

4. **Translation content**
   - I generate the Simplified Chinese copy for both the UI strings and templates. The client can correct any wording afterwards directly in the language files (UI) or the template editor (emails/SMS).

## Build order

1. Database column, i18n framework, language switcher in My Account, `common` strings — proves the loop end to end.
2. Booking flow + my bookings (highest-traffic screens).
3. My Account, membership, auth screens.
4. UF Lab, league and comp customer views.
5. Email/SMS template variants, sender logic, admin per-template language toggle.
6. Pass over toasts, dialogs and error messages missed in earlier steps.

## Technical notes

- `react-i18next` with `initReactI18next`, resources bundled at build time (no network fetch, no loading flash).
- Language is read once at boot from `localStorage`, reconciled with the profile after auth resolves, so there is no flash of English for Chinese users.
- Template variants are stored as extra columns on the existing template tables rather than duplicate rows, so template keys and existing send logic stay unchanged.
- Chinese renders fine with the current Montserrat stack because browsers fall back per-glyph; a CJK fallback font is added to the body font stack for consistent weight.
- No change to pricing, booking, Stripe or bay-controller logic — this is presentation only.
