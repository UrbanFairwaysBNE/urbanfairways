type BookingCustomer = {
  booking_type?: string | null;
  user_id: string;
  client_user_id?: string | null;
};

export function bookingCustomerId(booking: BookingCustomer): string | null {
  return booking.booking_type === "lesson" ? booking.client_user_id || null : booking.user_id;
}