// Button looks as class strings, so <button>, <Link> and form buttons can
// share them without a wrapper component. Every button is at least 44px
// tall, a comfortable touch target; `large` (56px) is for the main step on
// each page, easy to hit with one thumb on a phone.

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-[0.95rem] font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export const button = {
  primary: `${base} bg-primary text-on-primary hover:bg-primary-hover`,
  secondary: `${base} border border-edge bg-card text-ink hover:bg-selected`,
  ghost: `${base} text-ink hover:bg-selected`,
  // "Danger" (delete, delete my account) is told apart by its WORDS and a
  // heavy ink outline, not by red: red is kept for money and budgets only.
  danger: `${base} border-2 border-ink bg-card text-ink hover:bg-selected`,
  dangerOutline: `${base} border-2 border-dashed border-ink bg-card text-ink hover:bg-selected`,
  large: 'inline-flex min-h-14 items-center justify-center gap-2 rounded-control bg-primary px-5 text-lg font-bold text-on-primary no-underline transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60',
  largeSecondary:
    'inline-flex min-h-14 items-center justify-center gap-2 rounded-control border border-edge bg-card px-5 text-lg font-bold text-ink no-underline transition-colors hover:bg-selected disabled:cursor-not-allowed disabled:opacity-60',
  small:
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-edge bg-card px-3 text-sm font-semibold text-ink no-underline transition-colors hover:bg-selected disabled:cursor-not-allowed disabled:opacity-60',
  icon: 'inline-grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-selected hover:text-ink disabled:cursor-not-allowed disabled:opacity-45',
}
