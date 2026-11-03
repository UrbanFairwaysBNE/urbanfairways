import { expect, test } from "bun:test";
import { bayVerdict, bookingsVerdict, doorVerdict } from "./health-check.ts";

test("bay with bookings but no controller activity is red", () => {
  expect(bayVerdict({ bookings: 3 }).light).toBe("red");
});
test("bay with 1 failed close is amber, 3 is red", () => {
  expect(bayVerdict({ bookings: 1, events: 50, close_fail: 1, range_sessions: 1 }).light).toBe("amber");
  expect(bayVerdict({ bookings: 1, events: 50, close_fail: 3 }).light).toBe("red");
});
test("stuck checkout over 10 minutes is red", () => {
  expect(bookingsVerdict({ confirmed: 5, stuck_pending: 1 }).light).toBe("red");
});
test("missing daily door code is red", () => {
  expect(doorVerdict({ revoked: 1 }).light).toBe("red");
});
test("unverified shutdown is amber, not a confirmed close failure", () => {
  expect(bayVerdict({ bookings: 1, events: 50, close_unverified: 3, range_sessions: 1 }).light).toBe('amber');
  expect(bayVerdict({ bookings: 1, events: 50, range_sessions: 1 }).light).toBe('green');
});
