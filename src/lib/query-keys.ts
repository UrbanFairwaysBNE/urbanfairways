/**
 * Centralized query keys for React Query cache management
 * Using a constants object ensures consistent cache invalidation across the app
 */
export const QUERY_KEYS = {
  // Booking system
  BAYS: ['bays'] as const,
  PRICING: ['pricing'] as const,
  PRICING_SPECIALS: ['pricing-specials'] as const,

  BOOKINGS: (date?: string) => ['bookings', date] as const,
  USER_PROFILE: (userId?: string) => ['user-profile', userId] as const,
  SAVED_CARD: ['saved-card'] as const,
  PUBLIC_HOLIDAYS: ['public-holidays'] as const,
  
  // Admin
  ADMIN_BAYS: ['admin', 'bays'] as const,
  ADMIN_BOOKINGS: (date?: string) => ['admin', 'bookings', date] as const,
  ADMIN_CUSTOMERS: ['admin', 'customers'] as const,
  DASHBOARD_STATS: (filters?: Record<string, string>) => ['dashboard-stats', filters] as const,
  BAY_STATUSES: ['bay-statuses'] as const,
  
  // SGT
  SGT_TOURS: ['sgt', 'tours'] as const,
  SGT_MEMBERS: ['sgt', 'members'] as const,
  SGT_TOURNAMENTS: (tourId?: number) => ['sgt', 'tournaments', tourId] as const,
  SGT_SCORECARDS: (tournamentId?: number) => ['sgt', 'scorecards', tournamentId] as const,
  SGT_STANDINGS: (tourId?: number, grossOrNet?: string) => ['sgt', 'standings', tourId, grossOrNet] as const,
  
  // User
  CURRENT_USER: ['current-user'] as const,
  MY_BOOKINGS: ['my-bookings'] as const,
} as const;

/**
 * Stale time presets for different data types
 * - STATIC: Data that rarely changes (bays, pricing config)
 * - SEMI_STATIC: Data that changes occasionally (user profiles)
 * - DYNAMIC: Data that changes frequently (bookings, realtime data)
 */
export const STALE_TIMES = {
  STATIC: 1000 * 60 * 30, // 30 minutes
  SEMI_STATIC: 1000 * 60 * 5, // 5 minutes
  DYNAMIC: 1000 * 60 * 1, // 1 minute
  REALTIME: 0, // Always refetch (for data with realtime subscriptions)
} as const;
