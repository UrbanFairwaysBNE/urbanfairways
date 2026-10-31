import { expect, test } from "bun:test";
import { rangeSessionOwner } from "./range-session-owner.ts";

test("lesson exports belong to the customer, never the coach", () => {
  expect(rangeSessionOwner({ user_id: "coach", booking_type: "lesson", client_user_id: "customer" })).toBe("customer");
});
test("ordinary coach exports still belong to the coach", () => {
  expect(rangeSessionOwner({ user_id: "coach", booking_type: "bay", client_user_id: null })).toBe("coach");
});
test("Casual lesson customers are captured without checking membership", () => {
  expect(rangeSessionOwner({ user_id: "coach", booking_type: "lesson", client_user_id: "casual-customer" })).toBe("casual-customer");
});
test("missing lesson customer cannot save data to the coach", () => {
  expect(() => rangeSessionOwner({ user_id: "coach", booking_type: "lesson", client_user_id: null })).toThrow("lesson_customer_missing");
});