// The fixed lists the database CHECKs (db/migrations/007, 008) and the forms
// share, with a label for each. Plain data, so client components can use it.

export const PROPERTY_TYPES = ['studio', 'apartment', 'duplex', 'room', 'bq'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  studio: 'Studio',
  apartment: 'Apartment',
  duplex: 'Duplex',
  room: 'Private room',
  bq: 'BQ (boys’ quarters)',
}

export const LISTING_STATUSES = ['draft', 'pending_review', 'published', 'paused', 'rejected', 'archived'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Published',
  paused: 'Paused',
  rejected: 'Needs changes',
  archived: 'Archived',
}

export const CANCELLATION_POLICIES = ['flexible', 'moderate', 'strict'] as const
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number]
export const POLICY_LABELS: Record<CancellationPolicy, { name: string; summary: string }> = {
  flexible: { name: 'Flexible', summary: 'Full refund up to 24 hours before check-in.' },
  moderate: { name: 'Moderate', summary: 'Full refund up to 5 days before check-in.' },
  strict: { name: 'Strict', summary: '50% refund up to 7 days before check-in, then no refund.' },
}

export const STAY_STATUSES = ['held', 'confirmed', 'cancelled', 'expired', 'completed'] as const
export type StayStatus = (typeof STAY_STATUSES)[number]
export const STAY_STATUS_LABELS: Record<StayStatus, string> = {
  held: 'Waiting for payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Hold expired',
  completed: 'Completed',
}

export const AMENITY_GROUPS = ['power', 'essentials', 'safety', 'comfort', 'entertainment'] as const
export type AmenityGroup = (typeof AMENITY_GROUPS)[number]
export const AMENITY_GROUP_LABELS: Record<AmenityGroup, string> = {
  power: 'Power',
  essentials: 'Essentials',
  safety: 'Safety',
  comfort: 'Comfort',
  entertainment: 'Entertainment',
}

/** The areas the platform knows, for the home page and "Did you mean". */
export const STATES = ['Lagos', 'FCT', 'Rivers', 'Oyo'] as const

export const SORTS = ['recommended', 'price_asc', 'price_desc', 'rating', 'newest'] as const
export type Sort = (typeof SORTS)[number]
export const SORT_LABELS: Record<Sort, string> = {
  recommended: 'Recommended',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Top rated',
  newest: 'Newest',
}

/** How long a Reserve holds the nights while the guest pays. */
export const HOLD_MINUTES = 15
/** How far ahead a check-in may be. */
export const BOOKING_WINDOW_MONTHS = 12
export const MAX_PHOTOS = 12
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
