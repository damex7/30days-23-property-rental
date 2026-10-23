// Turns a browser's User-Agent string into a short label like
// "Chrome on Windows" for /account/sessions. A dozen lines of checks rather
// than a parsing library: the label only needs to help someone recognise
// their own devices, not identify every browser ever made.
//
// The order matters: Edge and Opera also say "Chrome", and Chrome also says
// "Safari", so the more specific names are tested first.

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/curl\//, 'curl'],
]

const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device'
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Unknown device'
}
