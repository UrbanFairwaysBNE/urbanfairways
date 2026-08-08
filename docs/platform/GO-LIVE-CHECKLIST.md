# GO-LIVE CHECKLIST — switching to urbanfairways.com.au

Testing runs on `https://urbanfairways.lovable.app`. Everything below must be done on
the day the custom domain goes live. Nothing here happens automatically.

## 1. Stripe webhooks (BREAKS PAYMENTS IF MISSED)

The Stripe webhook endpoint is registered against the current URL. When the domain
changes:

- Update (or add) the endpoint in the Stripe dashboard to the new backend function URL.
- Keep the old endpoint enabled for ~24h so in-flight events aren't lost, then delete it.
- If the endpoint is recreated rather than edited, Stripe issues a **new signing secret** —
  save it over `STRIPE_WEBHOOK_SECRET` or every webhook will fail signature verification.
- Re-test: a checkout, a subscription renewal, and a refund. Confirm each lands in
  `stripe_processed_events`.
- Update the customer portal return URL and any Checkout `success_url` / `cancel_url`
  overrides that reference the Lovable URL.

## 2. Bay Controller (BREAKS ALL BAY AUTOMATION IF MISSED)

The controller loads its webviews, booking data and extend-booking QR links from
`HUB_ORIGIN` in `electron/main.js`.

- Change `HUB_ORIGIN` from `https://urbanfairways.lovable.app` to
  `https://urbanfairways.com.au`.
- Push to `main` so GitHub Actions cuts a new release; `electron-updater` rolls it out to
  every bay PC automatically. Confirm each bay picks up the new version.
- Sanity check on one bay: booking list loads, plug on/off, app launch, extend QR resolves.

## 3. Everything else

- `tenant_settings`: `booking_domain`, `hub_domain`, any absolute URLs.
- Auth redirect URLs (Site URL + allowed redirects) for the new domain.
- Resend: confirm sending domain still verified; check email links resolve to the new host.
- Google OAuth authorised origins and redirect URIs.
- Capacitor `server` config / deep links for the iPhone and Android builds.
- Push notification config, if it references the origin.
- Re-run a booking end to end: confirmation email, door code, calendar link.
