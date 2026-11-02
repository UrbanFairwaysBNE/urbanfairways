export function needsMembershipReview(status: string | null | undefined): boolean {
  return status === "pending" || status === "rejected";
}