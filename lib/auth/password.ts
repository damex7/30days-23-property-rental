// PASSWORDS: hashing, checking, and the breached-password check.
import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

/*
  WHY HASH, NOT ENCRYPT

  Encryption is two-way: whoever has the key can decrypt every password.
  The key has to live on the server to check logins, so anyone who steals
  the database AND the server's environment has every password in plain
  text, ready to try on the victims' email and bank accounts.

  A hash is one-way. We never need the password back: to check a login we
  hash what was typed and compare. A stolen table of hashes can only be
  attacked by GUESSING: hash "password1", compare, hash "ada2004", compare...

  WHAT A SALT IS

  Before hashing, argon2 mixes in a random 16-byte SALT, different for every
  password, and stores it inside the result. Two people who both chose
  "lagos123" get completely different hashes, so:
  - an attacker can't hash a dictionary ONCE and look every user up in it
    (a "rainbow table"); each user has to be guessed separately;
  - nobody can see from the table that two users share a password.

  WHY THE COST SETTINGS MATTER

  A fast hash like SHA-256 runs billions of times per second on a gaming
  GPU, so the whole dictionary of likely passwords is tried in moments.
  argon2id is deliberately SLOW and MEMORY-HUNGRY: each guess needs
  `memoryCost` KiB of RAM, which is exactly what GPUs and custom chips are
  short of. We pay that cost once per login (about 50 ms); an attacker pays
  it for every one of their billions of guesses.

  The values are OWASP's recommended minimum for argon2id: 19 MiB of memory,
  2 passes, 1 lane. Raising them makes guessing more expensive but every
  login slower and more memory-hungry on a small serverless function. They
  are stored inside each hash ($argon2id$v=19$m=19456,t=2,p=1$...), so they
  can be raised later: needsRehash() spots old hashes at login.

  argon2id is the variant that resists both GPU cracking (like argon2d) and
  side-channel timing attacks (like argon2i). It is @node-rs/argon2's
  default; the CHECK constraint on users.password_hash insists on it.
*/
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const

const CURRENT_PARAMS = `m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}`

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

/**
 * A hash of a random password nobody knows, made once per server instance.
 * See verifyPassword for why it exists.
 */
let dummyHash: Promise<string> | null = null

/**
 * Checks a typed password against a stored hash.
 *
 * Pass `null` when there is no such user. We STILL run argon2 against a
 * dummy hash. Otherwise "no such email" would answer in 1 ms and "wrong
 * password" in 50 ms, and an attacker timing the responses could tell which
 * emails have accounts, defeating the identical error message.
 */
export async function verifyPassword(storedHash: string | null, password: string): Promise<boolean> {
  if (storedHash === null) {
    dummyHash ??= hashPassword(randomBytes(32).toString('base64url'))
    await verify(await dummyHash, password).catch(() => false)
    return false
  }
  try {
    return await verify(storedHash, password)
  } catch {
    // A malformed stored hash: treat it as "doesn't match", never as a pass.
    return false
  }
}

/** True when a stored hash was made with older (weaker) settings: rehash it at the next login. */
export function needsRehash(storedHash: string): boolean {
  return !storedHash.startsWith(`$argon2id$v=19$${CURRENT_PARAMS}$`)
}

/*
  HAVE I BEEN PWNED, WITH K-ANONYMITY

  Billions of real passwords have leaked from other sites, and attackers try
  those first. The Pwned Passwords service can tell us whether a password is
  on that list WITHOUT us sending it the password, or even its full hash:

  1. SHA-1 the password: "P@ssw0rd" -> 21BD12DC183F740EE76F27B78EB39C8AD972A757
  2. Send only the first 5 hex characters: GET /range/21BD1
  3. The service answers with EVERY leaked hash starting 21BD1 (around 800 of
     them, with how often each was seen), and we look for our remaining 35
     characters in that list, here on our server.

  The service learns only "someone checked a password whose hash starts
  21BD1", which hundreds of thousands of passwords share. That is
  k-anonymity: our request hides among k others that look identical.
  Add-Padding also adds fake entries, so even the SIZE of the answer
  doesn't narrow it down.

  SHA-1 is fine here: it's only an address into the list, not how we store
  anything. Stored passwords use argon2id above.
*/
export type BreachCheck = { breached: true; count: number } | { breached: false } | { breached: null }

const HIBP_TIMEOUT_MS = 2500

export async function checkBreachedPassword(password: string): Promise<BreachCheck> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'staybook-day23' },
      // Never let a slow third party hang a sign-up.
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.text()
    for (const line of body.split('\n')) {
      const [lineSuffix, count] = line.trim().split(':')
      // Padding lines have a count of 0: they are decoys, not leaks.
      if (lineSuffix === suffix && Number(count) > 0) return { breached: true, count: Number(count) }
    }
    return { breached: false }
  } catch (error) {
    // FAIL OPEN: if the service is down, allow the password and say so in
    // the logs. Refusing every sign-up because a third party is down would
    // be worse than occasionally missing a breached password.
    console.warn(`[auth] Pwned Passwords check skipped (${error instanceof Error ? error.message : 'unknown error'}). The password was allowed.`)
    return { breached: null }
  }
}

/** The message shown for a breached password. Tells the user why, without blaming them. */
export function breachedMessage(count: number): string {
  const times =
    count >= 1_000_000 ? `over ${Math.floor(count / 1_000_000).toLocaleString('en')} million` : count >= 1000 ? `over ${Math.floor(count / 1000).toLocaleString('en')} thousand` : count.toLocaleString('en')
  return `This password has been seen ${times} times in data breaches, so attackers try it early. Please choose a different one.`
}
