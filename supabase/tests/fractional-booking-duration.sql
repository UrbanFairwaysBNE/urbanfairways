-- Read-only regression: the real booking row type must preserve 1.5 hours.
-- The division fails if the duration is rounded or truncated; an integer column
-- fails while converting the JSON input, reproducing the original error.
SELECT 1 / CASE
  WHEN (jsonb_populate_record(
    NULL::public.bookings,
    '{"duration_hours":1.5}'::jsonb
  )).duration_hours = 1.5 THEN 1
  ELSE 0
END AS fractional_booking_duration_passed;