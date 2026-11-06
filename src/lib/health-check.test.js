import { expect, test } from "bun:test";
import { bayVerdict, bookingsVerdict, doorVerdict } from "./health-check.ts";

test("bay with bookings but no controller activity is red", () => {
  expect(bayVerdict({ bookings: 3 }).light).toBe("red");
});
test("optional UF Lab exports do not affect bay health when no sessions are submitted", () => {
  expect(bayVerdict({ bookings: 2, events: 50, range_sessions: 0 }).light).toBe("green");
  expect(bayVerdict({ bookings: 10, events: 100 }).light).toBe("green");
  expect(bayVerdict({ bookings: 2, events: 50, range_sessions: 0, settings_upload_fail: 1 }).light).toBe("amber");
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
test("immediate same-shutdown closure reports clear ambiguous warnings to green", () => {
  expect(bayVerdict({ bookings: 1, events: 50, close_unverified: 1, close_recovered: 1 }).light).toBe('green');
});
test("recovered shutdown does not hide another unresolved warning", () => {
  expect(bayVerdict({ bookings: 2, events: 50, close_unverified: 2, close_recovered: 1 }).light).toBe('amber');
});
test("recovery never clears confirmed running processes or forced power off", () => {
  expect(bayVerdict({ events: 50, close_recovered: 1, close_fail: 1 }).light).toBe('amber');
  expect(bayVerdict({ events: 50, close_recovered: 1, forced_off: 1 }).light).toBe('red');
});
test("a controller crash is red even when everything else is clean", () => {
  expect(bayVerdict({ bookings: 2, events: 50, controller_crash: 1 }).light).toBe('red');
  expect(bayVerdict({ bookings: 2, events: 50 }).light).toBe('green');
});
