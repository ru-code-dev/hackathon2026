import { describe, expect, it } from 'vitest'

import type {
  FindingCategory as DashboardCategory,
  Severity as DashboardSeverity,
} from '../../dashboard/src/contract.js'
import { findingCategorySchema, severitySchema, type FindingCategory, type Severity } from './findings.js'

/**
 * Keeps the dashboard's hand-written payload types in step with the zod schemas.
 *
 * The dashboard deliberately does not depend on the analyzer — that independence is what
 * lets it be built once and reused for every project, and it is worth keeping. But
 * independence was being paid for with a silent failure mode: the two declarations of
 * `FindingCategory` lived in different packages with nothing connecting them, so a category
 * added to the schema left the dashboard's type quietly lying about the data it receives.
 *
 * A type-only import costs nothing at runtime and adds nothing to the dashboard bundle —
 * it is erased. The build stays independent; only the contract is now checked. Drift fails
 * `npm run typecheck`, which is exactly where it should fail.
 */

/** Compile-time equality. Fails to typecheck when either side gains or loses a member. */
type Expect<T extends true> = T
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export type CategoriesAgree = Expect<Equals<FindingCategory, DashboardCategory>>
export type SeveritiesAgree = Expect<Equals<Severity, DashboardSeverity>>

describe('dashboard payload contract', () => {
  it('derives its enumerations from the schema rather than restating them', () => {
    // The type-level assertions above carry the real check. This keeps the runtime suite
    // honest about what the file guarantees, and pins the members that other code indexes
    // records by.
    expect(severitySchema.options).toStrictEqual(['error', 'warning', 'info', 'candidate'])
    expect(findingCategorySchema.options).toContain('a11y')
  })
})
