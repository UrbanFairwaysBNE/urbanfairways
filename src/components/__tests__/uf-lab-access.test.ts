import { describe, it, expect } from "vitest";
import { canAccessUFLab } from "../UFLabAccessGuard";
const base = { tierGrantsRange: false, isCoach: false, isStaff: false, isAdmin: false };
describe("UF Lab access", () => {
  it("blocks Casual customers", () => expect(canAccessUFLab(base)).toBe(false));
  it("allows range-access members", () => expect(canAccessUFLab({ ...base, tierGrantsRange: true })).toBe(true));
  it("allows coaches on any tier", () => expect(canAccessUFLab({ ...base, isCoach: true })).toBe(true));
});
