// Core types for the booking platform

export type MembershipTier = 'visitor' | 'weekday' | 'birdie' | 'eagle';

export interface MembershipPricing {
  tier: MembershipTier;
  name: string;
  weeklyFee: number;
  hourlyRate: number;
  description: string;
  features: string[];
  restrictions?: string;
}

export const MEMBERSHIP_TIERS: Record<MembershipTier, MembershipPricing> = {
  visitor: {
    tier: 'visitor',
    name: 'Visitor',
    weeklyFee: 0,
    hourlyRate: 35, // Peak rate - off-peak is $25
    description: 'Pay as you play',
    features: ['No commitment', 'Peak: $35/hr, Off-Peak: $25/hr', 'Book up to 1 week ahead'],
  },
  weekday: {
    tier: 'weekday',
    name: 'Weekday Member',
    weeklyFee: 15,
    hourlyRate: 10,
    description: 'Perfect for daytime players',
    features: ['$10/hr weekdays before 4pm', 'Swing Lab access', 'No weekend commitment', 'Cancel any time'],
  },
  birdie: {
    tier: 'birdie',
    name: 'Birdie Member',
    weeklyFee: 27,
    hourlyRate: 10,
    description: 'Play anytime',
    features: ['$10/hr anytime', 'League Access', 'Swing Lab access', 'Cancel any time'],
  },
  eagle: {
    tier: 'eagle',
    name: 'Eagle Member',
    weeklyFee: 35,
    hourlyRate: 8,
    description: 'Best value for regulars',
    features: ['$8/hr anytime', 'League Access', 'Swing Lab access', 'Priority booking', 'Cancel any time'],
  },
};

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
