import { expect, test } from "bun:test";
import { needsMembershipReview } from "./membership-verification.ts";

test("approved membership no longer shows the approval section", () => {
  expect(needsMembershipReview("approved")).toBe(false);
});
test("pending membership still shows approval controls", () => {
  expect(needsMembershipReview("pending")).toBe(true);
});
test("declined reviews remain visible", () => {
  expect(needsMembershipReview("rejected")).toBe(true);
});