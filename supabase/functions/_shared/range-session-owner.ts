type RangeBooking = {
  user_id: string;
  booking_type: string;
  client_user_id: string | null;
};

export function rangeSessionOwner(booking: RangeBooking): string {
  if (booking.booking_type !== "lesson") return booking.user_id;
  if (!booking.client_user_id) throw new Error("lesson_customer_missing");
  return booking.client_user_id;
}