import type { ReactElement } from 'react'
import { cn } from '@/lib/cn'

/*
  A tiny inline-SVG icon set, drawn by hand (no icon library). Each entry is
  the inside of a 24×24 stroked SVG. It has no state or server-only imports,
  so it works in Server and Client Components alike.

  `satisfies` checks every value is an element, while `keyof typeof ICONS`
  turns the keys into the IconName union: a typo is a compile error.
*/
const ICONS = {
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M9.9 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.3M6.4 7.2A15.5 15.5 0 0 0 2.5 12S6 18.5 12 18.5a8.7 8.7 0 0 0 4.4-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.6 2.6 5-5.3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4Z" />
      <path d="M12 10v4.5m0 2.5v.01" />
    </>
  ),
  errorCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5m0 3v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5m0-9v.01" />
    </>
  ),
  close: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  logout: (
    <>
      <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
      <path d="M10 12h10m-3.5-3.5L20 12l-3.5 3.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3 19a6 6 0 0 1 12 0M15.5 5.8a3.2 3.2 0 0 1 0 6.4M17.5 13.5A6 6 0 0 1 21 19" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  laptop: (
    <>
      <rect x="4.5" y="5.5" width="15" height="10" rx="1" />
      <path d="M2.5 18.5h19" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  trash: (
    <>
      <path d="M4.5 7h15M10 11v6m4-6v6" />
      <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    </>
  ),
  cloudOff: (
    <>
      <path d="M7 18.5h10.5a3.5 3.5 0 0 0 .6-6.95A6 6 0 0 0 7.2 9.6 4.5 4.5 0 0 0 7 18.5Z" />
      <path d="m4 4 16 16" />
    </>
  ),
  arrowLeft: <path d="M19 12H5m5-5-5 5 5 5" />,
  arrowRight: <path d="M5 12h14m-5-5 5 5-5 5" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  // ---- Day 18: inventory ----
  /** Dashboard: four counter tiles. */
  dashboard: (
    <>
      <rect x="4" y="4" width="7" height="8" rx="1" />
      <rect x="13" y="4" width="7" height="5" rx="1" />
      <rect x="4" y="14" width="7" height="6" rx="1" />
      <rect x="13" y="11" width="7" height="9" rx="1" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0Z" />
      <circle cx="8" cy="8" r="1.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  edit: (
    <>
      <path d="M14.5 5.5 18.5 9.5 9 19H5v-4Z" />
      <path d="m12.5 7.5 4 4" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
      <path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4" />
    </>
  ),
  restore: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
      <path d="M4.5 4.5V9H9" />
    </>
  ),
  /** Transfer: two arrows passing each other. */
  download: <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />,
  upload: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </>
  ),
  /** A chat bubble, for "send on WhatsApp" (not the WhatsApp logo). */
  chat: (
    <>
      <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.3A8 8 0 1 1 20 11.5Z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  filter: <path d="M4 5.5h16l-6 7.2v5.6l-4 1.7v-7.3Z" />,
  /** Sort state icons for table headers. */
  sortNone: <path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />,
  sortAsc: <path d="m7.5 14 4.5-4.5 4.5 4.5" />,
  sortDesc: <path d="m7.5 10 4.5 4.5 4.5-4.5" />,
  // BOOKING STATES: each has its own SHAPE, so a state reads without colour.
  /** Open slot: a plus in a circle ("take it"). */
  slotOpen: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  /** Booked: a filled dot inside a ring. */
  slotBooked: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </>
  ),
  /** Unavailable: a dash. */
  slotUnavailable: <path d="M6.5 12h11" />,
  /** Cancelled: a cross in a circle. */
  slotCancelled: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  /** No-show: an exclamation mark in a dashed circle. */
  slotNoShow: (
    <>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 2.4" />
      <path d="M12 7.5v5.5m0 3v.01" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M8.3 15.7 17 4.5M15.7 15.7 7 4.5" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6" />
      <path d="M4 4v4.6h4.6M12 8v4.3l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="1.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  door: (
    <>
      <path d="M6 20.5V4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M3.5 20.5h17" />
      <circle cx="14.5" cy="12.5" r="0.9" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9.5h-11zM13.5 10h4l3 3.2V16h-7" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z" />
      <path d="m4 7.2 8 4.3 8-4.3M12 11.5V21M8 5.1l8 4.3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  code: <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.5 5.5 4h13L20 9.5a2.7 2.7 0 0 1-5.3.3 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 9.5Z" />
      <path d="M5.5 11.5V20h13v-8.5M10 20v-5h4v5" />
    </>
  ),
  webhook: (
    <>
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="5.5" cy="17" r="2.5" />
      <circle cx="18.5" cy="17" r="2.5" />
      <path d="M10.8 8.2 7 14.8M8 17h8M13.2 8.2l3.8 6.6" />
    </>
  ),
  // Staybook additions, drawn the same way (24×24, 1.75 stroke).
  wallet: (
    <>
      <path d="M4 7.5h14.5a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M4 7.5 15.5 4.2a1.2 1.2 0 0 1 1.5 1.1V7.5M16 13.8h1.5" />
    </>
  ),
  bank: (
    <>
      <path d="M3.5 9.5 12 4.5l8.5 5M5 20h14M6 10.5V17M10 10.5V17M14 10.5V17M18 10.5V17" />
    </>
  ),
  transfer: (
    <>
      <path d="M4.5 8.5h13.5M14.5 5l3.5 3.5-3.5 3.5M19.5 15.5H6M9.5 12 6 15.5 9.5 19" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3.5 20 6.5 17 9.5M4.5 11.5V10a3.5 3.5 0 0 1 3.5-3.5h12M7 20.5 4 17.5 7 14.5M19.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16M7 16.5V11M11.5 16.5V6.5M16 16.5v-4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    </>
  ),
  split: (
    <>
      <path d="M12 20.5v-6.5M12 14 6 8M12 14l6-6M6 8V4.5M18 8V4.5M3.5 4.5h5M15.5 4.5h5" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4.5 20 11M6.5 9v10.5h11V9M10 19.5V14h4v5.5" />
    </>
  ),
  pouch: (
    <>
      <path d="M8.5 7.5c-3 2.5-4.5 5.5-4.5 8 0 3 2.8 4.5 8 4.5s8-1.5 8-4.5c0-2.5-1.5-5.5-4.5-8M8.5 7.5h7M9 7.5 7.5 4h9L15 7.5" />
    </>
  ),
  // Category icons (categories.icon in db/migrations/007): same 24×24 grid.
  basket: (
    <>
      <path d="M3.5 9.5h17l-1.8 9a1.5 1.5 0 0 1-1.5 1.2H6.8a1.5 1.5 0 0 1-1.5-1.2Z" />
      <path d="M8 9.5 11 4M16 9.5 13 4M9 13v3.5M12 13v3.5M15 13v3.5" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="13" r="6.5" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M3 4v5.5M5 4v5.5M3 9.5h2M4 9.5V20M21 4c-1.5 1-2 3-2 5h2V20" />
    </>
  ),
  bus: (
    <>
      <rect x="4.5" y="3.5" width="15" height="14" rx="2.5" />
      <path d="M4.5 11h15M8 17.5V20M16 17.5V20M7.5 14.5h1M15.5 14.5h1" />
    </>
  ),
  car: (
    <>
      <path d="M4 15.5V12l2-5h12l2 5v3.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM4 12h16" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
    </>
  ),
  signal: (
    <>
      <path d="M5 19v-3M9.5 19v-6M14 19v-9M18.5 19V5" />
    </>
  ),
  bolt: <path d="M13.5 3 5.5 13.5h6L10.5 21l8-10.5h-6Z" />,
  fuel: (
    <>
      <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20M3.5 20h12M5 10h9M14 9l3 2.5v6a1.5 1.5 0 0 0 3 0V8.5l-2.5-2.5" />
    </>
  ),
  school: (
    <>
      <path d="m2.5 9 9.5-4.5L21.5 9 12 13.5ZM6 11v5c2 2 10 2 12 0v-5M21.5 9v5" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="7" r="2.5" />
      <circle cx="16.5" cy="8.5" r="2" />
      <path d="M3.5 20v-3.5A4.5 4.5 0 0 1 8 12a4.5 4.5 0 0 1 4.5 4.5V20M13.5 20v-3a3 3 0 0 1 6 0v3" />
    </>
  ),
  worship: (
    <>
      <path d="M12 3v4M10 5h4M6 21V11l6-4 6 4v10M10 21v-4a2 2 0 0 1 4 0v4M3.5 21h17" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.5-7.5-10A4 4 0 0 1 12 7.8 4 4 0 0 1 19.5 10C19.5 15.5 12 20 12 20Z" />,
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M3.5 9h17M12 9v11M12 9S10.5 4.5 8 5s-1 4 4 4M12 9s1.5-4.5 4-4 1 4-4 4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3.5 12.5h17" />
    </>
  ),
  spark: <path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2Z" />,
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
      <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5S14.5 12.4 14.5 11V7M3.5 11v4c0 1.4 2.5 2.5 5.5 2.5 1 0 2-.1 2.8-.4" />
      <circle cx="16.5" cy="15.5" r="4" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="6.5" width="18" height="12" rx="2" />
      <path d="M8.5 21h7M8 3l4 3.5L16 3" />
    </>
  ),
  people: (
    <>
      <circle cx="12" cy="6.5" r="2.5" />
      <circle cx="5.5" cy="9.5" r="2" />
      <circle cx="18.5" cy="9.5" r="2" />
      <path d="M8 20v-3a4 4 0 0 1 8 0v3M2.5 19v-2a3 3 0 0 1 4.5-2.6M21.5 19v-2a3 3 0 0 0-4.5-2.6" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6ZM9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
} satisfies Record<string, ReactElement>

export type IconName = keyof typeof ICONS

/**
 * Decorative by default (aria-hidden): the button or link around it carries
 * the accessible name. Pass `label` for an icon that stands alone.
 */
export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-5 shrink-0', className)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {ICONS[name]}
    </svg>
  )
}
