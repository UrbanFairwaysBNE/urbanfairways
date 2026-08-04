-- Baseline seed: obviously-placeholder structure so the app is usable immediately.

-- 1. Bays
INSERT INTO public.bays (bay_number, name, is_active)
SELECT n, 'Bay ' || n, true FROM generate_series(1, 6) AS n
ON CONFLICT (bay_number) DO NOTHING;

-- 2. Operating hours 05:00-23:00 every day
INSERT INTO public.operating_hours (day_of_week, is_open, open_time, close_time)
SELECT d, true, '05:00'::time, '23:00'::time FROM generate_series(0, 6) AS d
ON CONFLICT (day_of_week) DO NOTHING;

-- 3. Staffed hours: rows exist but unstaffed by default
INSERT INTO public.staffed_hours (day_of_week, is_staffed, start_time, end_time)
SELECT d, false, '09:00'::time, '17:00'::time FROM generate_series(0, 6) AS d
ON CONFLICT (day_of_week) DO NOTHING;

-- 4. Default email layout using tenant merge values ({{venue_name}} is
--    substituted at send time from tenant_settings).
INSERT INTO public.email_layout (id, header_html, footer_html)
VALUES (
  'global',
  '<tr>
  <td align="center" style="background-color:#2F3134; padding:18px; border-radius:16px 16px 0 0;">
    <div style="font-family:Archivo, Impact, Arial Black, sans-serif; font-size:26px; letter-spacing:0.5px; color:#FFFFFF;">
      {{venue_name}}
    </div>
  </td>
</tr>',
  '<tr>
  <td style="background-color:#2F3134; padding:22px; border-radius:0 0 16px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
          <div>{{address}}</div>
          <div>{{support_phone}}</div>
          <div><a href="https://{{booking_domain}}" style="color:#FFFFFF; text-decoration:underline;">{{booking_domain}}</a></div>
          <div style="margin-top:10px; font-size:12px; opacity:0.75;">&copy; {{venue_name}}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Email template registry. html_content/subject left NULL so each edge
--    function renders its built-in neutral copy until an admin customises it.
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, is_active)
VALUES
  ('welcome', 'Welcome', 'Sent when a new customer creates an account.', NULL, NULL, true),
  ('booking_confirmation', 'Booking Confirmation', 'Sent after a booking is paid and confirmed.', NULL, NULL, true),
  ('booking_confirmation_first_unstaffed', 'Booking Confirmation (First Unstaffed Visit)', 'Extra guidance for a customer''s first visit during unstaffed hours.', NULL, NULL, true),
  ('booking_cancellation', 'Booking Cancellation', 'Sent when a booking is cancelled.', NULL, NULL, true),
  ('credit_added', 'Credit Added', 'Sent when account credit is added to a customer.', NULL, NULL, true),
  ('loyalty_credit', 'Loyalty Credit Earned', 'Sent when a customer reaches a loyalty milestone.', NULL, NULL, true),
  ('first_session_promo', 'First Session Promo', 'Follow-up offer after a customer''s first session.', NULL, NULL, true),
  ('feedback_request', 'Feedback Request', 'Asks a customer to rate their session.', NULL, NULL, true),
  ('membership_activated', 'Membership Activated', 'Sent when a membership subscription becomes active.', NULL, NULL, true),
  ('membership_cancelled', 'Membership Cancelled', 'Sent when a membership is cancelled.', NULL, NULL, true),
  ('membership_on_hold', 'Membership On Hold', 'Sent when a membership payment fails and the account is on hold.', NULL, NULL, true),
  ('payment_failed', 'Payment Failed', 'Sent when a subscription payment is declined.', NULL, NULL, true),
  ('league_welcome', 'League Welcome', 'Sent when a member is registered into the league.', NULL, NULL, true),
  ('league_weekly_winner', 'League Weekly Winner', 'Sent to the weekly league prize winner.', NULL, NULL, true),
  ('watched_customer_alert', 'Watched Customer Alert', 'Internal alert emailed to staff when a flagged customer books.', NULL, NULL, true)
ON CONFLICT (template_key) DO NOTHING;

-- 6. SMS templates with neutral placeholder copy (message is NOT NULL).
INSERT INTO public.sms_templates (template_key, name, description, message, is_active)
VALUES
  ('booking_confirmation', 'Booking Confirmation',
   'Sent after a booking is confirmed.',
   'Hi {first_name}, your booking is confirmed for {short_date} at {booking_time} in {bay_name}. Door code: {door_code}. {staffed_status}. See you soon!',
   true),
  ('booking_confirmation_first_unstaffed', 'Booking Confirmation (First Unstaffed Visit)',
   'First visit during unstaffed hours - includes access guidance.',
   'Hi {first_name}, your first booking is confirmed for {short_date} at {booking_time} in Bay {bay_number}. The venue is unstaffed at this time - use door code {door_code} to let yourself in. Arrive a few minutes early.',
   true),
  ('booking_reschedule', 'Booking Rescheduled',
   'Sent when a booking is moved to a new time.',
   'Hi {first_name}, your booking has been moved to {short_date} at {booking_time} in {bay_name}. Door code: {door_code}.',
   true),
  ('booking_cancellation', 'Booking Cancelled',
   'Sent when a booking is cancelled.',
   'Hi {first_name}, your booking on {short_date} at {start_time_24} in Bay {bay_number} has been cancelled.',
   true),
  ('boom_gate_access', 'Gate Access',
   'Second message with gate or after-hours access details.',
   'Hi {first_name}, for your {short_date} booking at {booking_time} you may also need gate access. Follow the on-site instructions at the entry keypad.',
   true)
ON CONFLICT (template_key) DO NOTHING;

-- 7. Door access settings: present but disabled, placeholder 6-digit code.
INSERT INTO public.door_access_settings (id, mode, fixed_code, code_length, append_hash, provider, enabled)
VALUES ('global', 'fixed', '000000', 6, true, 'manual', false)
ON CONFLICT (id) DO NOTHING;