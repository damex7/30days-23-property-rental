// npm run db:seed
//
// Sample data for Staybook, SAFE TO RUN TWICE: users are matched by email,
// listings by slug, and a listing's photos, amenities, stays and reviews are
// only created in the same run that created the listing. A second run
// changes nothing and says so.
//
// What it makes:
//   - an admin (SEED_ADMIN_PASSWORD) and a guest (SEED_USER_PASSWORD), plus
//     four past guests who wrote the reviews
//   - 3 hosts (SEED_USER_PASSWORD) and the shared, read-only DEMO host
//   - 18 published listings across Lagos, Abuja, Port Harcourt and Ibadan,
//     with weekend prices, amenities and photos; 2 more pending review
//   - booked nights (some confirmed and paid, some in the past and completed,
//     with reviews), host-blocked nights, and a festive-season price rule
//
// Photos are real room photographs in /public/seed (CC0, credited in
// public/seed/CREDITS.md), NOT uploaded to Blob (the seed shouldn't need a
// Blob token), so their URLs are /seed/... which the listing_photos CHECK
// allows alongside the Blob store (db/migrations/012).
//
// Every booking's price snapshot comes from lib/pricing.ts, the same function
// Reserve uses, so the totals pass the stays_total_adds_up CHECK.

import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { demoAddress } from '@/lib/auth/email'
import { hashPassword } from '@/lib/auth/password'
import { http, type Db } from '@/lib/db/executor'
import { q } from '@/lib/db/sql'
import { closePool, withTransaction } from '@/lib/db/tx'
import { quoteStay, type ListingPrices } from '@/lib/pricing'
import { refreshRating } from '@/lib/repos/listings'
import { addDays, todayInLagos } from '@/lib/time'

const userPassword = process.env.SEED_USER_PASSWORD
const adminPassword = process.env.SEED_ADMIN_PASSWORD
if (!userPassword || userPassword.length < 8 || !adminPassword || adminPassword.length < 8) {
  console.error('Set SEED_USER_PASSWORD and SEED_ADMIN_PASSWORD (8+ characters each) in .env.local first.')
  process.exit(1)
}

const naira = (n: number) => n * 100

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
type Person = { email: string; name: string; role: 'guest' | 'host' | 'admin'; phone?: string; demo?: boolean; admin?: boolean }

const PEOPLE: Person[] = [
  { email: 'admin@example.com', name: 'Halima Bello', role: 'admin', admin: true },
  { email: 'guest@example.com', name: 'Kemi Adeyemi', role: 'guest', phone: '+2348031234567' },
  { email: 'amaka@example.com', name: 'Amaka Okafor', role: 'host', phone: '+2348021112233' },
  { email: 'tunde@example.com', name: 'Tunde Bakare', role: 'host', phone: '+2348092223344' },
  { email: 'zainab@example.com', name: 'Zainab Musa', role: 'host', phone: '+2347033334455' },
  { email: demoAddress('host'), name: 'Demo Host', role: 'host', phone: '+2348000000000', demo: true },
  { email: 'chioma@example.com', name: 'Chioma Eze', role: 'guest' },
  { email: 'segun@example.com', name: 'Segun Alabi', role: 'guest' },
  { email: 'ifeanyi@example.com', name: 'Ifeanyi Nwosu', role: 'guest' },
  { email: 'aisha@example.com', name: 'Aisha Lawal', role: 'guest' },
]

async function upsertPeople(): Promise<Map<string, string>> {
  const userHash = await hashPassword(userPassword!)
  const adminHash = await hashPassword(adminPassword!)
  const ids = new Map<string, string>()
  let created = 0
  for (const p of PEOPLE) {
    const hash = p.demo ? null : p.admin ? adminHash : userHash
    const inserted = await http.query(q`
      INSERT INTO users (email, name, role, password_hash, email_verified_at, is_demo, phone)
      VALUES (${p.email}, ${p.name}, ${p.role}, ${hash}, now(), ${p.demo ?? false}, ${p.phone ?? null})
      ON CONFLICT (email) DO NOTHING
      RETURNING id`)
    if (inserted.length > 0) created++
    const row = await http.query(q`SELECT id FROM users WHERE email = ${p.email}`)
    ids.set(p.email, String(row[0]!.id))
  }
  console.log(`✓ people: ${created} created, ${PEOPLE.length - created} already there`)
  return ids
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
type SeedListing = {
  slug: string
  host: string
  title: string
  type: 'studio' | 'apartment' | 'duplex' | 'room' | 'bq'
  bedrooms: number
  bathrooms: number
  guests: number
  state: string
  city: string
  area: string
  address: string
  lat: number
  lng: number
  nightly: number
  weekend: number | null
  cleaning: number
  deposit: number
  weekly: number
  minNights: number
  maxNights: number
  policy: 'flexible' | 'moderate' | 'strict'
  amenities: string[]
  rooms: string[]
  description: string
  status?: 'published' | 'pending_review'
  festive?: number
}

const COMMON_RULES = 'No parties or loud music after 10pm. No smoking indoors. Visitors must be registered with security at the gate. Please switch off the AC when you go out.'

const LISTINGS: SeedListing[] = [
  // LAGOS: Lekki Phase 1
  { slug: 'lekki-phase-1-two-bed-with-pool', host: 'amaka@example.com', title: 'Bright two-bed by the Lekki Phase 1 pool', type: 'apartment', bedrooms: 2, bathrooms: 2, guests: 4, state: 'Lagos', city: 'Lagos', area: 'Lekki Phase 1', address: '14 Admiralty Way, Lekki Phase 1', lat: 6.4478, lng: 3.4723, nightly: 85_000, weekend: 100_000, cleaning: 15_000, deposit: 50_000, weekly: 10, minNights: 2, maxNights: 30, policy: 'moderate', amenities: ['power-24-7', 'generator', 'inverter', 'wifi', 'ac', 'kitchen', 'security', 'gated', 'parking', 'pool', 'netflix'], rooms: ['living-1', 'bedroom-1', 'kitchen-1', 'bathroom-1', 'pool-1'], description: 'A calm, sunny two-bedroom on a quiet close off Admiralty Way, five minutes from the Lekki toll gate. Both bedrooms have a king bed and their own bathroom. The estate runs a generator and the flat has an inverter, so the power stays on through the night. Shared pool, gym and a security post at the gate.', festive: 140_000 },
  { slug: 'lekki-studio-for-remote-work', host: 'amaka@example.com', title: 'Lekki studio with a proper desk and fast Wi-Fi', type: 'studio', bedrooms: 0, bathrooms: 1, guests: 2, state: 'Lagos', city: 'Lagos', area: 'Lekki Phase 1', address: '3B Fola Osibo Road, Lekki Phase 1', lat: 6.4436, lng: 3.4785, nightly: 45_000, weekend: 52_000, cleaning: 8_000, deposit: 30_000, weekly: 15, minNights: 1, maxNights: 60, policy: 'flexible', amenities: ['power-24-7', 'solar', 'inverter', 'wifi', 'ac', 'workspace', 'security', 'netflix'], rooms: ['workspace-1', 'bedroom-2', 'kitchen-2', 'bathroom-2'], description: 'Built for working away from home: a 200 Mbps fibre line, a real desk and chair, and solar with an inverter so a power cut never drops your call. Walk to cafés on Fola Osibo, ten minutes to the Lekki-Ikoyi bridge.' },
  { slug: 'lekki-duplex-for-families', host: 'tunde@example.com', title: 'Four-bed family duplex with a PS5 lounge', type: 'duplex', bedrooms: 4, bathrooms: 4, guests: 8, state: 'Lagos', city: 'Lagos', area: 'Lekki Phase 1', address: '22 Babatunde Anjous Avenue, Lekki Phase 1', lat: 6.4512, lng: 3.4669, nightly: 210_000, weekend: 250_000, cleaning: 30_000, deposit: 150_000, weekly: 10, minNights: 2, maxNights: 30, policy: 'strict', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'kitchen', 'washer', 'security', 'cctv', 'gated', 'parking', 'ps5', 'netflix', 'dstv', 'housekeeping'], rooms: ['exterior-1', 'living-2', 'bedroom-3', 'kitchen-3', 'balcony-1'], description: 'Room for the whole family for weddings and December visits: four en-suite bedrooms, a living room with a PS5 and DStv, and a kitchen for cooking jollof for twelve. Daily housekeeping, a 20 kVA generator and two parking spaces inside the compound.', festive: 320_000 },
  // LAGOS: Victoria Island
  { slug: 'victoria-island-skyline-apartment', host: 'tunde@example.com', title: 'Victoria Island apartment with a skyline balcony', type: 'apartment', bedrooms: 2, bathrooms: 2, guests: 4, state: 'Lagos', city: 'Lagos', area: 'Victoria Island', address: '9 Adeola Odeku Street, Victoria Island', lat: 6.4281, lng: 3.4219, nightly: 140_000, weekend: 165_000, cleaning: 20_000, deposit: 100_000, weekly: 8, minNights: 2, maxNights: 21, policy: 'moderate', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'kitchen', 'security', 'cctv', 'parking', 'gym', 'netflix'], rooms: ['balcony-2', 'living-3', 'bedroom-4', 'bathroom-3', 'kitchen-4'], description: 'On the 11th floor above Adeola Odeku, with a balcony looking over the lagoon towards Ikoyi. Walk to the banks and restaurants of VI; the building has a lift, a gym and a 24-hour concierge.', festive: 190_000 },
  { slug: 'vi-one-bed-near-eko-atlantic', host: 'zainab@example.com', title: 'Quiet one-bed near Eko Atlantic', type: 'apartment', bedrooms: 1, bathrooms: 1, guests: 2, state: 'Lagos', city: 'Lagos', area: 'Victoria Island', address: '4 Ahmadu Bello Way, Victoria Island', lat: 6.4239, lng: 3.4110, nightly: 95_000, weekend: 110_000, cleaning: 12_000, deposit: 60_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'flexible', amenities: ['power-24-7', 'inverter', 'wifi', 'ac', 'kitchen', 'security', 'parking', 'dstv'], rooms: ['bedroom-1', 'living-4', 'kitchen-1', 'bathroom-4'], description: 'A tidy one-bed on Ahmadu Bello Way, close to Eko Atlantic and the Federal Palace. Good for a work trip: quiet, an inverter for power, and a 24-hour gatehouse.' },
  // LAGOS: Ikoyi
  { slug: 'ikoyi-garden-flat-bourdillon', host: 'amaka@example.com', title: 'Garden flat off Bourdillon Road', type: 'apartment', bedrooms: 3, bathrooms: 3, guests: 6, state: 'Lagos', city: 'Lagos', area: 'Ikoyi', address: '7 Thompson Avenue, Ikoyi', lat: 6.4549, lng: 3.4346, nightly: 180_000, weekend: 200_000, cleaning: 25_000, deposit: 120_000, weekly: 12, minNights: 2, maxNights: 45, policy: 'moderate', amenities: ['power-24-7', 'generator', 'borehole', 'wifi', 'ac', 'kitchen', 'washer', 'security', 'gated', 'parking', 'housekeeping'], rooms: ['living-1', 'exterior-2', 'bedroom-2', 'kitchen-2', 'bathroom-1'], description: 'A leafy ground-floor flat with its own garden on a quiet street off Bourdillon. Three bedrooms, borehole water, a big generator and a caretaker on site.' },
  { slug: 'ikoyi-penthouse-studio', host: 'zainab@example.com', title: 'Penthouse studio with lagoon views', type: 'studio', bedrooms: 0, bathrooms: 1, guests: 2, state: 'Lagos', city: 'Lagos', area: 'Ikoyi', address: '15 Alexander Road, Ikoyi', lat: 6.4479, lng: 3.4402, nightly: 120_000, weekend: 140_000, cleaning: 15_000, deposit: 80_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'strict', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'workspace', 'security', 'cctv', 'pool', 'gym', 'netflix'], rooms: ['workspace-2', 'balcony-3', 'bathroom-2', 'pool-2'], description: 'A top-floor studio with floor-to-ceiling windows over the lagoon. Rooftop pool, gym, and a lift that actually works.' },
  // LAGOS: Yaba
  { slug: 'yaba-studio-near-unilag', host: 'tunde@example.com', title: 'Yaba studio, a walk from UNILAG and the tech hubs', type: 'studio', bedrooms: 0, bathrooms: 1, guests: 2, state: 'Lagos', city: 'Lagos', area: 'Yaba', address: '31 Herbert Macaulay Way, Yaba', lat: 6.5095, lng: 3.3711, nightly: 35_000, weekend: 40_000, cleaning: 5_000, deposit: 20_000, weekly: 15, minNights: 1, maxNights: 60, policy: 'flexible', amenities: ['power-24-7', 'solar', 'wifi', 'workspace', 'security'], rooms: ['workspace-3', 'bedroom-3', 'bathroom-3'], description: 'Simple and well kept, in the heart of Yaba’s tech district. Solar power, good Wi-Fi and a desk; Tejuosho market and UNILAG are a short walk away.' },
  { slug: 'yaba-bq-quiet-compound', host: 'zainab@example.com', title: 'Self-contained BQ in a quiet Yaba compound', type: 'bq', bedrooms: 1, bathrooms: 1, guests: 2, state: 'Lagos', city: 'Lagos', area: 'Yaba', address: '6 Adebayo Street, Alagomeji, Yaba', lat: 6.4987, lng: 3.3784, nightly: 22_000, weekend: null, cleaning: 3_000, deposit: 15_000, weekly: 10, minNights: 2, maxNights: 60, policy: 'moderate', amenities: ['inverter', 'wifi', 'borehole', 'security', 'kitchen'], rooms: ['bedroom-4', 'kitchen-3', 'bathroom-4'], description: 'A self-contained boys’ quarters behind a family house: its own entrance, a small kitchen and an inverter for evenings. Great value for a longer stay.' },
  // ABUJA: Wuse 2
  { slug: 'wuse-2-apartment-near-banex', host: 'zainab@example.com', title: 'Wuse 2 apartment near Banex Plaza', type: 'apartment', bedrooms: 2, bathrooms: 2, guests: 4, state: 'FCT', city: 'Abuja', area: 'Wuse 2', address: '12 Aminu Kano Crescent, Wuse 2', lat: 9.0790, lng: 7.4700, nightly: 85_000, weekend: 95_000, cleaning: 12_000, deposit: 50_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'moderate', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'kitchen', 'security', 'parking', 'dstv'], rooms: ['living-2', 'bedroom-1', 'kitchen-4', 'bathroom-2', 'exterior-3'], description: 'Right on Aminu Kano Crescent, a short walk from Banex Plaza and the restaurants of Wuse 2. Jacaranda trees outside the window in the dry season.' },
  { slug: 'wuse-2-studio-for-business', host: 'demo+host@example.com', title: 'Business studio in Wuse 2', type: 'studio', bedrooms: 0, bathrooms: 1, guests: 2, state: 'FCT', city: 'Abuja', area: 'Wuse 2', address: '40 Adetokunbo Ademola Crescent, Wuse 2', lat: 9.0815, lng: 7.4746, nightly: 55_000, weekend: 60_000, cleaning: 8_000, deposit: 30_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'flexible', amenities: ['power-24-7', 'inverter', 'wifi', 'ac', 'workspace', 'security', 'netflix'], rooms: ['workspace-4', 'bedroom-2', 'bathroom-1'], description: 'A compact studio for a work trip to Abuja: a desk, fibre Wi-Fi and an inverter, minutes from the ministries.' },
  // ABUJA: Maitama
  { slug: 'maitama-duplex-with-garden', host: 'tunde@example.com', title: 'Maitama duplex with a walled garden', type: 'duplex', bedrooms: 4, bathrooms: 5, guests: 8, state: 'FCT', city: 'Abuja', area: 'Maitama', address: '5 Mississippi Street, Maitama', lat: 9.0833, lng: 7.4977, nightly: 220_000, weekend: 240_000, cleaning: 30_000, deposit: 150_000, weekly: 10, minNights: 2, maxNights: 30, policy: 'strict', amenities: ['power-24-7', 'generator', 'solar', 'borehole', 'wifi', 'ac', 'kitchen', 'washer', 'security', 'cctv', 'gated', 'parking', 'pool', 'housekeeping', 'dstv'], rooms: ['exterior-4', 'living-3', 'bedroom-4', 'pool-3', 'kitchen-1'], description: 'A quiet, embassy-street duplex in Maitama with a walled garden and a private pool. Solar plus a generator, borehole water and housekeeping every morning.' },
  { slug: 'maitama-one-bed-garden-view', host: 'demo+host@example.com', title: 'Maitama one-bed with a garden view', type: 'apartment', bedrooms: 1, bathrooms: 1, guests: 2, state: 'FCT', city: 'Abuja', area: 'Maitama', address: '18 Danube Street, Maitama', lat: 9.0871, lng: 7.4929, nightly: 75_000, weekend: 85_000, cleaning: 10_000, deposit: 40_000, weekly: 12, minNights: 1, maxNights: 30, policy: 'moderate', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'kitchen', 'security', 'gated', 'parking'], rooms: ['bedroom-3', 'living-4', 'balcony-4', 'bathroom-3'], description: 'A peaceful one-bed in a gated Maitama compound, looking over the garden. Ideal for a couple or a long work stay.' },
  // ABUJA: Gwarinpa
  { slug: 'gwarinpa-two-bed-estate', host: 'zainab@example.com', title: 'Two-bed in a Gwarinpa estate', type: 'apartment', bedrooms: 2, bathrooms: 2, guests: 4, state: 'FCT', city: 'Abuja', area: 'Gwarinpa', address: '3rd Avenue, 23 Road, Gwarinpa', lat: 9.1092, lng: 7.4057, nightly: 50_000, weekend: 55_000, cleaning: 8_000, deposit: 30_000, weekly: 15, minNights: 2, maxNights: 60, policy: 'flexible', amenities: ['inverter', 'generator', 'borehole', 'wifi', 'kitchen', 'washer', 'security', 'gated', 'parking'], rooms: ['living-1', 'bedroom-2', 'kitchen-2', 'bathroom-4'], description: 'A roomy two-bed in one of Gwarinpa’s quiet estates: good for families, with a washing machine and space to park.' },
  // PORT HARCOURT: GRA
  { slug: 'port-harcourt-gra-apartment', host: 'amaka@example.com', title: 'GRA apartment close to the airport road', type: 'apartment', bedrooms: 2, bathrooms: 2, guests: 4, state: 'Rivers', city: 'Port Harcourt', area: 'GRA', address: '21 Tombia Street, GRA Phase 2', lat: 4.8156, lng: 7.0074, nightly: 60_000, weekend: 70_000, cleaning: 10_000, deposit: 40_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'moderate', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'kitchen', 'security', 'parking', 'dstv'], rooms: ['living-2', 'bedroom-1', 'bathroom-2', 'kitchen-3'], description: 'In GRA Phase 2, close to the restaurants on Tombia Street and the road to the airport. Reliable generator and a security man on the gate all night.' },
  { slug: 'port-harcourt-gra-family-duplex', host: 'tunde@example.com', title: 'GRA family duplex with a pool', type: 'duplex', bedrooms: 3, bathrooms: 4, guests: 6, state: 'Rivers', city: 'Port Harcourt', area: 'GRA', address: '8 Ezimgbu Link Road, GRA Phase 3', lat: 4.8238, lng: 7.0153, nightly: 150_000, weekend: 170_000, cleaning: 20_000, deposit: 100_000, weekly: 10, minNights: 2, maxNights: 30, policy: 'strict', amenities: ['power-24-7', 'generator', 'borehole', 'wifi', 'ac', 'kitchen', 'washer', 'security', 'cctv', 'gated', 'parking', 'pool', 'ps5'], rooms: ['exterior-1', 'pool-4', 'living-3', 'bedroom-4'], description: 'A three-bed duplex in GRA Phase 3 with its own small pool and a PS5 for the children. Borehole water and a big generator.' },
  // IBADAN: Bodija
  { slug: 'bodija-bungalow-near-ui', host: 'zainab@example.com', title: 'Bodija bungalow near the University of Ibadan', type: 'apartment', bedrooms: 3, bathrooms: 2, guests: 6, state: 'Oyo', city: 'Ibadan', area: 'Bodija', address: '11 Awolowo Avenue, Old Bodija', lat: 7.4290, lng: 3.9100, nightly: 40_000, weekend: 45_000, cleaning: 6_000, deposit: 25_000, weekly: 15, minNights: 1, maxNights: 60, policy: 'flexible', amenities: ['inverter', 'generator', 'borehole', 'wifi', 'kitchen', 'security', 'parking'], rooms: ['exterior-2', 'living-4', 'bedroom-3', 'kitchen-4'], description: 'A three-bed bungalow in Old Bodija, ten minutes from UI and the Bodija market. Room to park, borehole water and a generator.' },
  { slug: 'bodija-room-in-family-home', host: 'amaka@example.com', title: 'Private room in a friendly Bodija home', type: 'room', bedrooms: 1, bathrooms: 1, guests: 1, state: 'Oyo', city: 'Ibadan', area: 'Bodija', address: '2 Ashi Road, New Bodija', lat: 7.4336, lng: 3.9152, nightly: 18_000, weekend: null, cleaning: 0, deposit: 10_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'flexible', amenities: ['inverter', 'wifi', 'borehole', 'security'], rooms: ['bedroom-1', 'bathroom-1'], description: 'A private room with its own bathroom in a warm family home. Breakfast on request; the family will point you to the best amala in town.' },
  // Pending review
  { slug: 'lekki-new-build-three-bed', host: 'tunde@example.com', title: 'New-build three-bed in Lekki Phase 1', type: 'apartment', bedrooms: 3, bathrooms: 3, guests: 6, state: 'Lagos', city: 'Lagos', area: 'Lekki Phase 1', address: '9 Freedom Way, Lekki Phase 1', lat: 6.4462, lng: 3.4741, nightly: 150_000, weekend: 175_000, cleaning: 20_000, deposit: 100_000, weekly: 10, minNights: 2, maxNights: 30, policy: 'moderate', amenities: ['power-24-7', 'generator', 'wifi', 'ac', 'kitchen', 'security', 'parking', 'netflix'], rooms: ['living-3', 'bedroom-2', 'kitchen-1', 'bathroom-3'], description: 'Just finished: a three-bed with new appliances on Freedom Way. Waiting for the admin’s review before it goes live.', status: 'pending_review' },
  { slug: 'wuse-2-loft-pending', host: 'amaka@example.com', title: 'Wuse 2 loft above the shops', type: 'apartment', bedrooms: 1, bathrooms: 1, guests: 2, state: 'FCT', city: 'Abuja', area: 'Wuse 2', address: '27 Ademola Adetokunbo Crescent, Wuse 2', lat: 9.0769, lng: 7.4781, nightly: 65_000, weekend: 70_000, cleaning: 8_000, deposit: 30_000, weekly: 10, minNights: 1, maxNights: 30, policy: 'flexible', amenities: ['power-24-7', 'inverter', 'wifi', 'ac', 'security'], rooms: ['bedroom-4', 'living-1', 'bathroom-4'], description: 'A bright loft above the shops on Ademola Adetokunbo, close to everything in Wuse 2. Submitted for review.', status: 'pending_review' },
]

/**
 * The seed photos in /public/seed: real room photographs released as CC0
 * (public/seed/CREDITS.md), some JPEG and some WebP. "living-1" → the file
 * that exists, so the seed never points at a missing image.
 */
const SEED_DIR = new URL('../public/seed/', import.meta.url)
function seedPhoto(room: string): string {
  for (const ext of ['jpg', 'webp']) if (existsSync(new URL(`${room}.${ext}`, SEED_DIR))) return `${room}.${ext}`
  throw new Error(`No seed photo for ${room} in public/seed`)
}

/** A readable alt text for each kind of photo, the kind a host would write. */
const ALT: Record<string, string> = {
  living: 'Living room with a sofa and soft daylight',
  bedroom: 'Bedroom with a made-up double bed by the window',
  kitchen: 'Fitted kitchen with a worktop and built-in oven',
  bathroom: 'Bathroom with a bathtub and a vanity unit',
  balcony: 'Balcony with seating and an outdoor view',
  exterior: 'Outside of the apartment building',
  pool: 'Swimming pool with clear blue water',
  workspace: 'Desk by a window with a computer',
}

const PAST_GUESTS = ['chioma@example.com', 'segun@example.com', 'ifeanyi@example.com', 'aisha@example.com']
const REVIEW_TEXTS = [
  'Exactly as described. The power never went off once, and the host answered within minutes when we needed help with the gate.',
  'Lovely, clean place in a great location. Wi-Fi was fast enough for video calls all week.',
  'Comfortable and quiet. The generator came on a few times at night but the inverter covered it. Would book again.',
  'Spotless on arrival and the caretaker was very kind. A little noisy on Friday night, but nothing serious.',
]

function prices(l: SeedListing): ListingPrices {
  return { nightlyKobo: naira(l.nightly), weekendKobo: l.weekend ? naira(l.weekend) : null, cleaningFeeKobo: naira(l.cleaning), cautionDepositKobo: naira(l.deposit), weeklyDiscountPercent: l.weekly }
}

async function insertBooking(tx: Db, l: SeedListing, listingId: string, hostId: string, guestId: string, checkIn: string, checkOut: string, status: 'confirmed' | 'completed') {
  const quote = quoteStay(prices(l), checkIn, checkOut)
  const reference = `SB-SEED-${randomBytes(5).toString('hex').toUpperCase()}`
  const rows = await tx.query(q`
    INSERT INTO stays (kind, listing_id, host_id, guest_id, nights, status, guests_count, price_lines, subtotal_kobo, discount_kobo,
                       cleaning_fee_kobo, service_fee_kobo, caution_deposit_kobo, total_kobo, cancellation_policy, paystack_reference,
                       confirmed_at, completed_at)
    VALUES ('booking', ${listingId}, ${hostId}, ${guestId}, daterange(${checkIn}::date, ${checkOut}::date, '[)'), ${status},
            ${Math.min(2, l.guests)}, ${JSON.stringify(quote.nights)}::jsonb, ${quote.subtotalKobo}, ${quote.discountKobo},
            ${quote.cleaningFeeKobo}, ${quote.serviceFeeKobo}, ${quote.cautionDepositKobo}, ${quote.totalKobo}, ${l.policy}, ${reference},
            now(), ${status === 'completed' ? q`now()` : q`NULL`})
    RETURNING id`)
  const stayId = String(rows[0]!.id)
  await tx.query(q`INSERT INTO payments (stay_id, provider, reference, amount_kobo, status, paid_at)
                   VALUES (${stayId}, 'demo', ${reference.replace('SB-', 'DEMO-')}, ${quote.totalKobo}, 'success', now())`)
  return stayId
}

async function seedListings(ids: Map<string, string>): Promise<void> {
  const today = todayInLagos()
  let created = 0
  for (const [index, l] of LISTINGS.entries()) {
    const hostId = ids.get(l.host)!
    const made = await withTransaction(async (tx) => {
      const status = l.status ?? 'published'
      const inserted = await tx.query(q`
        INSERT INTO listings (host_id, slug, title, description, property_type, bedrooms, bathrooms, max_guests, state, city, area,
                              address_line, lat, lng, nightly_kobo, weekend_kobo, cleaning_fee_kobo, caution_deposit_kobo,
                              weekly_discount_percent, min_nights, max_nights, cancellation_policy, house_rules, checkin_instructions,
                              status, submitted_at, published_at)
        VALUES (${hostId}, ${l.slug}, ${l.title}, ${l.description}, ${l.type}, ${l.bedrooms}, ${l.bathrooms}, ${l.guests}, ${l.state}, ${l.city}, ${l.area},
                ${l.address}, ${l.lat}, ${l.lng}, ${naira(l.nightly)}, ${l.weekend ? naira(l.weekend) : null}, ${naira(l.cleaning)}, ${naira(l.deposit)},
                ${l.weekly}, ${l.minNights}, ${l.maxNights}, ${l.policy}, ${COMMON_RULES},
                ${'The caretaker, Musa, meets you at the gate. Call the host when you are 15 minutes away. The gate code is 4521.'},
                ${status}, now() - make_interval(days => ${40 - index}), ${status === 'published' ? q`now() - make_interval(days => ${40 - index})` : q`NULL`})
        ON CONFLICT (slug) DO NOTHING
        RETURNING id`)
      if (inserted.length === 0) return false
      const listingId = String(inserted[0]!.id)

      for (const [position, room] of l.rooms.entries()) {
        const kind = room.split('-')[0]!
        await tx.query(q`INSERT INTO listing_photos (listing_id, host_id, blob_url, blob_pathname, width, height, alt_text, position)
                         VALUES (${listingId}, ${hostId}, ${`/seed/${seedPhoto(room)}`}, ${`seed/${seedPhoto(room)}`}, 1024, 683, ${ALT[kind] ?? 'A room in the flat'}, ${position})`)
      }
      await tx.query(q`INSERT INTO listing_amenities (listing_id, amenity_code) SELECT ${listingId}, unnest(${l.amenities}::text[])`)
      if (l.festive) {
        const year = Number(today.slice(0, 4)) + (today.slice(5) > '12-20' ? 1 : 0)
        await tx.query(q`INSERT INTO price_rules (listing_id, host_id, nights, nightly_kobo, label)
                         VALUES (${listingId}, ${hostId}, daterange(${`${year}-12-20`}::date, ${`${year + 1}-01-03`}::date), ${naira(l.festive)}, 'Festive season')`)
      }
      if (status !== 'published') return true

      // Past stays (completed, with reviews) by the past guests, never the host.
      const reviewers = PAST_GUESTS.filter((email) => email !== l.host).slice(0, 1 + (index % 3))
      for (const [n, email] of reviewers.entries()) {
        const start = addDays(today, -70 + n * 15)
        const nights = Math.max(l.minNights, 2 + (n % 2))
        const stayId = await insertBooking(tx, l, listingId, hostId, ids.get(email)!, start, addDays(start, nights), 'completed')
        const base = 3 + ((index + n) % 3)
        await tx.query(q`INSERT INTO reviews (stay_id, listing_id, guest_id, overall, cleanliness, location, value, power_supply, comment, created_at)
                         VALUES (${stayId}, ${listingId}, ${ids.get(email)!}, ${Math.min(5, base + 1)}, ${Math.min(5, base + 1)}, 5, ${base}, ${Math.min(5, base + (l.amenities.includes('power-24-7') ? 2 : 0))},
                                 ${REVIEW_TEXTS[(index + n) % REVIEW_TEXTS.length]!}, now() - make_interval(days => ${60 - n * 15}))`)
      }
      // Upcoming: a confirmed, paid booking for every other listing, and a host block on every third.
      if (index % 2 === 0) {
        const start = addDays(today, 5 + (index % 5))
        await insertBooking(tx, l, listingId, hostId, ids.get(PAST_GUESTS[index % PAST_GUESTS.length]!)!, start, addDays(start, Math.max(l.minNights, 3)), 'confirmed')
      }
      if (index % 3 === 0) {
        const start = addDays(today, 16 + (index % 4))
        await tx.query(q`INSERT INTO stays (kind, listing_id, host_id, nights, status, block_note)
                         VALUES ('host_block', ${listingId}, ${hostId}, daterange(${start}::date, ${addDays(start, 3)}::date, '[)'), 'confirmed', 'Family visiting')`)
      }
      // The seeded guest (guest@example.com): one trip coming up, and one finished stay waiting for their review.
      if (l.slug === 'lekki-studio-for-remote-work') {
        await insertBooking(tx, l, listingId, hostId, ids.get('guest@example.com')!, addDays(today, 24), addDays(today, 27), 'confirmed')
      }
      if (l.slug === 'wuse-2-apartment-near-banex') {
        await insertBooking(tx, l, listingId, hostId, ids.get('guest@example.com')!, addDays(today, -12), addDays(today, -9), 'completed')
      }
      return true
    })
    if (made) created++
  }
  const refreshed = await refreshRating(http, null)
  console.log(`✓ listings: ${created} created, ${LISTINGS.length - created} already there (ratings refreshed on ${refreshed})`)
}

/**
 * A database seeded BEFORE the photos became real photographs still points
 * at /seed/*.svg files that no longer exist. Point those rows at the
 * matching photo (same room, same number) with the new alt text. Safe to
 * run any number of times: once updated, no row matches.
 */
async function refreshSeedPhotos(): Promise<void> {
  const old = await http.query(q`SELECT id, blob_url FROM listing_photos WHERE blob_url LIKE '/seed/%.svg'`)
  for (const row of old) {
    const room = String(row.blob_url).replace(/^\/seed\//, '').replace(/\.svg$/, '')
    const file = seedPhoto(room)
    await http.query(q`UPDATE listing_photos SET blob_url = ${`/seed/${file}`}, blob_pathname = ${`seed/${file}`}, width = 1024, height = 683,
                           alt_text = ${ALT[room.split('-')[0]!] ?? 'A room in the flat'} WHERE id = ${String(row.id)}`)
  }
  console.log(`✓ seed photos: ${old.length} switched from drawings to photographs`)
}

try {
  const ids = await upsertPeople()
  await seedListings(ids)
  await refreshSeedPhotos()
  console.log(`
Sign in with:
  guest@example.com   (SEED_USER_PASSWORD)   a guest with an upcoming trip and a stay to review
  amaka@example.com   (SEED_USER_PASSWORD)   a host (also tunde@ and zainab@)
  admin@example.com   (SEED_ADMIN_PASSWORD)  the admin: two listings are waiting for review
Or use the demo buttons on the home page.`)
} finally {
  await closePool()
}
