// Cover-pattern id/label list for the booking-page illustrated cover
// (components/booking/BookingCover.jsx) and its Sessions.jsx picker. Kept
// in its own plain file rather than exported alongside BookingCover's
// React components, so Fast Refresh doesn't warn about one file mixing
// component and non-component exports -- same reasoning
// utils/sessionTypeIcon.jsx already documents for the same class of
// warning.
export const DEFAULT_COVER_PATTERN = 'mountains'

export const COVER_PATTERN_OPTIONS = [
  { id: 'mountains', label: 'Mountains' },
  { id: 'trees', label: 'Trees' },
  { id: 'moon', label: 'Moon & Stars' },
]
