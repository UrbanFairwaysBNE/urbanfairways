import { describe, it, expect } from "bun:test";
import { normalizeEmail, unsubscribeToken, validUnsubscribeToken, unsubscribeUrl, isMarketingSuppressed } from "./marketing-unsubscribe";

describe("marketing opt-out", () => {
  it("validates recipient-specific links and rejects forged tokens", async () => {
    const token = await unsubscribeToken("person@example.com", "test-secret");
    expect(await validUnsubscribeToken("person@example.com", token, "test-secret", "Test Venue")).toBe(true);
    expect(await validUnsubscribeToken("other@example.com", token, "test-secret", "Test Venue")).toBe(false);
    expect(await validUnsubscribeToken("person@example.com", "", "test-secret", "Test Venue")).toBe(false);
  });
  it("retains previously sent links", async () => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("person@example.comvenue-unsubscribe-salt"));
    const token = Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
    expect(await validUnsubscribeToken("person@example.com", token, "test-secret", "Test Venue")).toBe(true);
  });
  it("uses the public website origin, not the protected app path", () => {
    const url = new URL(unsubscribeUrl("https://example.com/app", " Person+test@Example.com ", "abc"));
    expect(url.pathname).toBe("/unsubscribe");
    expect(url.searchParams.get("email")).toBe("person+test@example.com");
    expect(normalizeEmail(" USER@EXAMPLE.COM ")).toBe("user@example.com");
  });
  it("suppresses manually opted-out customers at send time", async () => {
    const client = { from: (table: string) => ({ select: () => ({ ilike: async () => ({ data: [{ marketing_opt_out: true }] }), eq: () => ({ limit: async () => ({ data: table === "marketing_unsubscribes" ? [] : null }) }) }) }) };
    expect(await isMarketingSuppressed(client, "person@example.com")).toBe(true);
  });
  it("suppresses recorded unsubscribes even without a profile", async () => {
    const client = { from: () => ({ select: () => ({ ilike: async () => ({ data: [] }), eq: () => ({ limit: async () => ({ data: [{ id: "event" }] }) }) }) }) };
    expect(await isMarketingSuppressed(client, "person@example.com")).toBe(true);
  });
});