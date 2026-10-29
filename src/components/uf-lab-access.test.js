import { describe, expect, test } from "bun:test";
import { canAccessUFLab } from "./UFLabAccessGuard";
const base = { tierGrantsRange: false, isCoach: false, isStaff: false, isAdmin: false };
describe("UF Lab access", () => {
  test("blocks Casual customers", () => expect(canAccessUFLab(base)).toBe(false));
  test("allows range-access members", () => expect(canAccessUFLab({ ...base, tierGrantsRange: true })).toBe(true));
  test("allows coaches on any tier", () => expect(canAccessUFLab({ ...base, isCoach: true })).toBe(true));
});
