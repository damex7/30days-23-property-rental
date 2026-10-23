// npm run check:contrast
//
// Reads the colour tokens from app/globals.css (both sides of every
// light-dark() pair) and checks the text/background pairs the UI actually
// uses against WCAG 2.2 contrast minimums, in light AND dark mode:
//   text  4.5:1  normal-size text
//   ui    3:1    non-text UI: input borders, the focus ring, progress fills
// Colours with transparency are blended onto the background first, as the
// browser does.
// Exits with code 1 if any pair fails, so it can run in CI.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

const COLOUR = String.raw`#[0-9a-f]{6}|rgb\(\s*\d+\s+\d+\s+\d+\s*\/\s*[\d.]+\s*\)`
const tokens = {}
for (const m of css.matchAll(new RegExp(String.raw`--color-([a-z-]+):\s*(?:light-dark\(\s*(${COLOUR})\s*,\s*(${COLOUR})\s*\)|(${COLOUR}))`, 'gi'))) {
  const [, name, light, dark, both] = m
  tokens[name] = { light: light ?? both, dark: dark ?? both }
}

/** → [r, g, b, alpha] in 0-255 / 0-1. */
function parse(colour) {
  if (colour.startsWith('#')) return [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)).concat(1)
  const [r, g, b, a] = colour.match(/[\d.]+/g).map(Number)
  return [r, g, b, a]
}

function blend(fg, bg) {
  const [r, g, b, a] = fg
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)]
}

function luminance([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(fgColour, bgColour) {
  const bg = parse(bgColour)
  const fg = blend(parse(fgColour), bg)
  const [x, y] = [luminance(fg), luminance(bg)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// [foreground, background, kind, where it's used]
// Form fields never sit directly on `sunken` (the edge is only 2.8:1 there):
// the filter sheet and the photo queue put them on a card first.
const PAIRS = [
  ['ink', 'page', 'text', 'body text and headings on the concrete page'],
  ['ink', 'card', 'text', 'text on cards and panels'],
  ['ink', 'sunken', 'text', 'text in the filter sheet, calendar header, empty states'],
  ['ink', 'well', 'text', 'typed text in inputs'],
  ['muted', 'page', 'text', 'secondary text on the page'],
  ['muted', 'card', 'text', 'hints, dates and details on cards'],
  ['muted', 'sunken', 'text', 'secondary text in sunken areas, booked nights'],
  ['primary', 'page', 'text', 'links and the brand name'],
  ['primary', 'card', 'text', 'links on cards, the wishlist heart'],
  ['primary', 'sunken', 'text', 'links in sunken areas'],
  ['on-primary', 'primary', 'text', 'primary buttons, selected check-in/out dates'],
  ['on-primary', 'primary-hover', 'text', 'primary buttons (hover)'],
  ['on-range', 'range', 'text', 'the nights between check-in and check-out'],
  ['on-sand', 'sand', 'text', 'price tags, map pins, the Total pill, Pending review'],
  ['sand-ink', 'page', 'text', 'star ratings and "Guest favourite" on the page'],
  ['sand-ink', 'card', 'text', 'star ratings on cards'],
  ['danger', 'card', 'text', 'error messages'],
  ['danger', 'page', 'text', 'error messages on the page'],
  ['success', 'card', 'text', 'success messages, the weekly discount line'],
  ['on-footer', 'footer', 'text', 'footer text'],
  ['on-footer-muted', 'footer', 'text', 'footer secondary text'],
  ['edge', 'card', 'ui', 'form field borders on cards (WCAG 1.4.11)'],
  ['edge', 'page', 'ui', 'form field and secondary button borders on the page'],
  ['primary', 'card', 'ui', 'focus ring, checkboxes, the heart icon'],
  ['primary', 'page', 'ui', 'focus ring on the page'],
  ['danger', 'card', 'ui', 'invalid field border'],
]

let failed = 0
for (const mode of ['light', 'dark']) {
  console.log(`\n${mode.toUpperCase()} MODE`)
  for (const [fg, bg, kind, where] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`  ?  ${fg} on ${bg}: token missing`)
      failed++
      continue
    }
    const r = ratio(tokens[fg][mode], tokens[bg][mode])
    const min = kind === 'text' ? 4.5 : 3
    const ok = r >= min
    if (!ok) failed++
    console.log(`  ${ok ? '✓' : '✗'}  ${r.toFixed(2).padStart(5)}:1  ${fg} on ${bg}  (${where})`)
  }
}
console.log(failed ? `\n${failed} pair(s) below the minimum.` : '\nEvery pair passes.')
process.exit(failed ? 1 : 0)
