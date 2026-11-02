export function complimentaryProfileUpdate(tier: { tier: string; is_subscription: boolean; is_default: boolean }) {
  if (!tier.is_subscription || tier.is_default) throw new Error("Choose a membership tier, not Casual.");
  return { membership_tier: tier.tier, custom_billing: true, membership_on_hold: false, payment_failed_at: null };
}

export function assertNoPaidMembership(statuses: string[], hasOpenCheckout: boolean) {
  if (statuses.some(status => !["canceled", "incomplete_expired"].includes(status)) || hasOpenCheckout) {
    throw new Error("This customer has an existing subscription or unfinished membership checkout. Cancel it before granting a complimentary membership.");
  }
}