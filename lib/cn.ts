/** Joins class names, skipping false/null/undefined. A tiny stand-in for clsx. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
