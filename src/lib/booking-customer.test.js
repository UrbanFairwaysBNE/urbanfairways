import { describe, expect, test } from "bun:test";
import { bookingCustomerId } from "./booking-customer.ts";

describe("lesson booking customer", () => {
  test("uses the lesson customer instead of the coach", () => {
    expect(bookingCustomerId({ booking_type: "lesson", user_id: "coach", client_user_id: "customer" })).toBe("customer");
  });
  test("ordinary bookings use the booker", () => {
    expect(bookingCustomerId({ booking_type: "bay", user_id: "coach", client_user_id: null })).toBe("coach");
  });
  test("a lesson without a linked customer never falls back to the coach", () => {
    expect(bookingCustomerId({ booking_type: "lesson", user_id: "coach", client_user_id: null })).toBeNull();
  });
});