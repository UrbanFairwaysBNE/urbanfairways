import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Execute the deployed matching predicate in PostgreSQL via the read-only SQL check;
// retain its exact fixture cases with the source delivery.
export const matchingFixtures = [
  { warningBay: 2, closedBay: 2, warningBooking: 'a', closedBooking: 'a', seconds: -0.002, matches: true },
  { warningBay: 2, closedBay: 2, warningBooking: 'a', closedBooking: 'a', seconds: 10, matches: true },
  { warningBay: 2, closedBay: 3, warningBooking: 'a', closedBooking: 'a', seconds: 10, matches: false },
  { warningBay: 2, closedBay: 2, warningBooking: 'a', closedBooking: 'b', seconds: 10, matches: false },
  { warningBay: 2, closedBay: 2, warningBooking: 'a', closedBooking: 'a', seconds: 31, matches: false },
];
test('SQL recovery uses same bay, same booking and bounded local event time', () => {
  const sql = readFileSync('drizzle/migrations/0009_reconcile_shutdown_health_reports.sql', 'utf8');
  expect(sql).toContain('c.bay_number=w.bay_number');
  expect(sql).toContain('c.booking_id=w.booking_id');
  expect(sql).toContain("w.occurred_at-interval '2 seconds' AND w.occurred_at+interval '30 seconds'");
});