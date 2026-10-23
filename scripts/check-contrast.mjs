// npm run check:contrast
//
// Reads the colour tokens from app/globals.css (both sides of every
// light-dark() pair) and checks the text/background pairs the UI actually
// uses against WCAG 2.2 contrast minimums, in light AND dark mode:
//   text  4.5:1  normal-size text
//   ui    3:1    non-text UI: input borders, the focus ring, progress fills
// Colours with transparency (Lavender at 78% for dark-mode secondary text)
// are blended onto the background first, as the browser does.
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
const PAIRS = [
  ['ink', 'page', 'text', 'body text and headings on the page'],
  ['ink', 'card', 'text', 'text on cards'],
  ['ink', 'well', 'text', 'typed text in inputs'],
  ['ink', 'selected', 'text', 'selected rows, hovered links, the chosen option'],
  ['muted', 'page', 'text', 'secondary text, the top bar and navigation'],
  ['muted', 'card', 'text', 'hints and dates on cards, the bottom nav'],
  ['muted', 'well', 'text', 'muted text in inputs and day headings'],
  ['primary', 'page', 'text', 'links, the active tab'],
  ['primary', 'card', 'text', 'links on cards, "Edit" summaries'],
  ['on-primary', 'primary', 'text', 'primary buttons'],
  ['on-primary', 'primary-hover', 'text', 'primary buttons (hover)'],
  ['money-in', 'page', 'text', '+ money in'],
  ['money-in', 'card', 'text', '+ money in on cards'],
  ['money-out', 'page', 'text', '− money out, over budget'],
  ['money-out', 'card', 'text', '− money out on cards'],
  ['warn', 'page', 'text', '80% used'],
  ['warn', 'card', 'text', '80% used on cards'],
  ['edge', 'page', 'ui', 'input and button borders'],
  ['edge', 'card', 'ui', 'input borders on cards'],
  ['primary', 'card', 'ui', 'focus ring'],
  ['bar', 'track', 'ui', 'progress bar (on track) against its track'],
  ['warn', 'track', 'ui', 'progress bar (80% used) against its track'],
  ['money-out', 'track', 'ui', 'progress bar (over budget) against its track'],
  ['bar', 'card', 'ui', 'chart bars and lines on cards'],
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
