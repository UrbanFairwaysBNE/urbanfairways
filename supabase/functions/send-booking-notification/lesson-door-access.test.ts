import { describe, expect, test } from "bun:test";
import { withLessonDoorAccess } from "../_shared/lesson-door-access.ts";

describe("lesson door access", () => {
  for (const recipient of ["client", "coach"]) {
    for (const type of ["confirmation", "reschedule"]) {
      for (const channel of ["email", "sms"] as const) {
        test(`${recipient} ${type} ${channel} includes the resolved lesson door code`, () => {
          expect(withLessonDoorAccess(`Lesson for ${recipient}`, "123456#", channel, type)).toContain("123456#");
        });
      }
    }
  }
  test("does not duplicate a code already rendered by a template", () => {
    expect(withLessonDoorAccess("Door: 123456#", "123456#", "sms", "confirmation")).toBe("Door: 123456#");
  });
  test("does not add access to cancellation notices or disabled SMS", () => {
    expect(withLessonDoorAccess("Cancelled", "123456#", "email", "cancellation")).toBe("Cancelled");
    expect(withLessonDoorAccess("", "123456#", "sms", "confirmation")).toBe("");
  });
  test("uses the recipient language for the added access label", () => {
    expect(withLessonDoorAccess("课程已确认", "123456#", "sms", "confirmation", "zh")).toContain("门禁密码: 123456#");
  });
});