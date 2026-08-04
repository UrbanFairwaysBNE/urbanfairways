// Core types for the booking platform

// Tier keys and metadata are venue-defined and live in `pricing_config`.
// See `src/lib/tier-config.ts` — nothing about a tier is hardcoded here.
export type MembershipTier = string;

export interface MembershipPricing {
  tier: MembershipTier;
  name: string;
  weeklyFee: number;
  hourlyRate: number;
  description: string;
  features: string[];
  restrictions?: string;
}

export interface Bay {
  id: string;
  number: number;
  name: string;
  locationId: string;
  isActive: boolean;
}

export interface Location {
  id: string;
  name: string;
  slug: string;
  address: string;
  timezone: string;
  isActive: boolean;
}

export interface TimeSlot {
  time: string; // HH:MM format
  isAvailable: boolean;
  price?: number;
  isPeak?: boolean;
}

export interface Booking {
  id: string;
  bayId: string;
  customerId: string;
  locationId: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in hours
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: Date;
}

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  membershipTier: MembershipTier;
  locationId: string; // Primary location
  createdAt: Date;
}

// Booking grid configuration
export const BOOKING_CONFIG = {
  slotDuration: 30, // minutes
  minBookingDuration: 60, // 1 hour minimum
  maxBookingDuration: 240, // 4 hours maximum
  bookingIncrements: [1, 2, 3, 4], // hours
  openingHour: 8, // 8 AM
  closingHour: 22, // 10 PM
  totalBays: 6,
} as const;
