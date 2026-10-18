import { describe, expect, test } from "bun:test";
import { blockEndTime } from "./bay-block-utils";

describe("admin block duration", () => {
  test("allows a 10-hour block", () => {
    expect(blockEndTime("05:30", 10, "05:30", "23:00")).toBe("15:30");
  });
  test("rejects a block longer than 10 hours", () => {
    expect(() => blockEndTime("05:30", 10.5, "05:30", "23:00")).toThrow();
  });
  test("does not allow a block beyond closing time", () => {
    expect(() => blockEndTime("13:30", 10, "05:30", "23:00")).toThrow();
  });
});