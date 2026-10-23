// SERVICE ERRORS: how the business rules say "no".
//
// A service never builds an HTTP response; it throws one of these. Server
// Actions turn them into a FormState message under the right field
// (lib/action-helpers.ts), and the few route handlers into a status code.
// So a rule like "a stale version is a conflict" is written once.
//
// 409 OR 422? Both mean "understood, but no".
//   422 Unprocessable Content: the input itself is wrong: a field fails
//       validation, splits don't add up, a transfer to the same account.
//       Sending the same thing again will always fail.
//   409 Conflict: the input was fine but clashes with the CURRENT STATE:
//       the transaction was edited in another tab since you opened it
//       (stale version), the account was archived. Re-reading and trying
//       again may well succeed.
import 'server-only'

export type FieldIssue = { field: string; message: string }

export type ServiceErrorKind =
  | 'bad_request' // 400: malformed (bad JSON, a missing required header)
  | 'unauthorized' // 401: no valid credentials
  | 'forbidden' // 403: valid credentials, not allowed (role, scope, read-only demo)
  | 'not_found' // 404: doesn't exist, OR isn't yours (never 403: see ownership in the README)
  | 'conflict' // 409: clashes with the current state
  | 'invalid' // 422: validation / business-rule failure on the input
  | 'rate_limited' // 429: too many requests; retryAfterSeconds says when to come back
  | 'unavailable' // 503: the database can't be reached

export const STATUS_FOR: Record<ServiceErrorKind, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid: 422,
  rate_limited: 429,
  unavailable: 503,
}

export type ServiceErrorOptions = {
  /** Field-level problems (validation), shown under each field. */
  errors?: FieldIssue[]
  /** Extra machine-readable details, e.g. the latest saved values after a stale edit. */
  details?: Record<string, unknown>
  retryAfterSeconds?: number
}

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind
  /** A stable machine-readable code, e.g. "stale_version". */
  readonly code: string
  readonly errors: FieldIssue[]
  readonly details: Record<string, unknown>
  readonly retryAfterSeconds: number | undefined

  constructor(kind: ServiceErrorKind, code: string, message: string, options: ServiceErrorOptions = {}) {
    super(message)
    this.name = 'ServiceError'
    this.kind = kind
    this.code = code
    this.errors = options.errors ?? []
    this.details = options.details ?? {}
    this.retryAfterSeconds = options.retryAfterSeconds
  }

  get status(): number {
    return STATUS_FOR[this.kind]
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}

// Short constructors, so services read like the rules they enforce.

export const notFound = (what: string) => new ServiceError('not_found', 'not_found', `${what} was not found.`)

export const unauthorized = (message = 'Please sign in.') =>
  new ServiceError('unauthorized', 'unauthorized', message)

export const forbidden = (code: string, message: string) => new ServiceError('forbidden', code, message)

export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ServiceError('conflict', code, message, { details })

export const invalid = (code: string, message: string, errors: FieldIssue[] = [], details?: Record<string, unknown>) =>
  new ServiceError('invalid', code, message, { errors, details })

export const badRequest = (code: string, message: string) => new ServiceError('bad_request', code, message)

/**
 * The optimistic-concurrency answer: this was saved somewhere else (another
 * tab, your phone) after you opened it. `latest` carries the values now in
 * the database, so the form can show them next to what you typed.
 */
export const staleVersion = (what: string, latest: Record<string, unknown> | null) =>
  conflict('stale_version', `This ${what} was changed in another tab or device after you opened it. The latest saved values are shown below: check them, then save again.`, {
    latest,
  })

