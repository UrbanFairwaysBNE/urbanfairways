import { expect, test } from "bun:test";
import { complimentaryProfileUpdate, assertNoPaidMembership } from "./complimentary-membership.ts";

test("complimentary membership assigns the selected tier and enables no-charge custom billing", () => {
  expect(complimentaryProfileUpdate({ tier: "birdie", is_subscription: true, is_default: false })).toEqual({ membership_tier: "birdie", custom_billing: true, membership_on_hold: false, payment_failed_at: null });
});
test("Casual cannot be granted as a membership", () => {
  expect(() => complimentaryProfileUpdate({ tier: "casual", is_subscription: false, is_default: true })).toThrow();
});
test("existing billable subscriptions must not silently remain charging", () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
    expect(() => assertNoPaidMembership([status], false)).toThrow();
  }
  expect(() => assertNoPaidMembership(["canceled", "incomplete_expired"], false)).not.toThrow();
});
test("unfinished subscription checkout blocks a complimentary assignment", () => {
  expect(() => assertNoPaidMembership([], true)).toThrow();
});