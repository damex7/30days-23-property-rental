// Small display helpers shared by server and client components.

/** "14:00" → "2:00 pm" (Lagos wall-clock time, as the host set it). */
export function formatClock(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** "1 night" / "3 nights". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-NG')} ${count === 1 ? one : many}`
}
