// A LIVE STRENGTH HINT, computed in the browser as you type.
//
// It is only a hint, to nudge people towards long passphrases. It doesn't
// block anything: the real rules are on the server (8 to 128 characters,
// and not in a known data breach, see lib/auth/password.ts). Length counts
// most, because every extra character multiplies the guesses needed; a
// long string of ordinary words beats a short jumble of symbols.

import { PASSWORD_MIN } from '@/lib/validation'

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; tip: string | null }

const COMMON = ['password', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'abc123', '123456', '111111', 'naija', 'lagos']

export function estimateStrength(password: string, userInputs: string[] = []): Strength {
  if (password.length === 0) return { score: 0, label: 'Strength', tip: 'Longer is stronger: try three or four unrelated words' }
  if (password.length < PASSWORD_MIN) {
    return { score: 0, label: 'Too short', tip: `Use at least ${PASSWORD_MIN} characters` }
  }

  let score = 1
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((r) => r.test(password)).length
  if (kinds >= 3) score++

  const lower = password.toLowerCase()
  const personal = userInputs
    .flatMap((input) => input.toLowerCase().split(/[\s@.]+/))
    .filter((part) => part.length >= 3)
  let tip: string | null = null
  if (COMMON.some((word) => lower.includes(word))) {
    score = Math.min(score, 1)
    tip = 'It contains a very common password'
  } else if (personal.some((part) => lower.includes(part))) {
    score = Math.min(score, 1)
    tip = 'Avoid your name or email address'
  } else if (/(.)\1{2,}/.test(password) || /(0123|1234|2345|3456|4567|5678|6789|abcd)/i.test(password)) {
    score = Math.min(score, 2)
    tip = 'Avoid repeats and sequences like 1234'
  } else if (score < 3) {
    tip = 'Add another word or two to make it stronger'
  }

  const clamped = Math.min(4, Math.max(1, score)) as Strength['score']
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][clamped] ?? 'Fair'
  return { score: clamped, label, tip }
}
