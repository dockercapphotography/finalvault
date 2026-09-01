// Shared session-type -> icon rendering, reusing the SESSION_TYPE_ICON
// mapping already used for internal Sessions (sessionApi.js) so public
// booking pages show the same icon a photographer already sees for a
// given category, instead of the previous fixed camera icon everywhere.
//
// Deliberately its own small file rather than folded into Sessions.jsx
// (which defines the same lookup inline): Sessions.jsx is an
// authenticated, internal-only route with its own large import list,
// and the public booking pages should depend on as little of it as
// possible. If the two ever need to be reconciled into one definition,
// Sessions.jsx's inline SESSION_ICON_MAP/SessionTypeIcon can be swapped
// to import from here instead.
import {
  BookHeart, SquareUser, Users, Briefcase, Ticket, Home, GraduationCap,
  Baby, User, Trophy, Heart, CalendarDays,
} from 'lucide-react'
import { SESSION_TYPE_ICON } from './sessionApi.js'

const SESSION_ICON_MAP = {
  BookHeart, SquareUser, Users, Briefcase, Ticket, Home, GraduationCap,
  Baby, User, Trophy, Heart, CalendarDays,
}

export function SessionTypeIcon({ type, size = 18, color, style }) {
  const iconName = SESSION_TYPE_ICON[type] || 'CalendarDays'
  const Icon = SESSION_ICON_MAP[iconName] || CalendarDays
  return <Icon size={size} style={{ color, ...style }} />
}
