/**
 * Deterministic comparators.
 *
 * `String.prototype.localeCompare` is locale-sensitive: it orders `helper` before
 * `Mode` under an ICU collation but after it under code-unit ordering, and the active
 * locale depends on the machine. Artifacts are committed and diffed, so ordering must
 * be identical on every machine — hence plain code-unit comparison everywhere.
 */

export const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

export const compareNumbers = (left: number, right: number): number => left - right

/** Sorts a copy of `values` in deterministic code-unit order. */
export const sortStrings = (values: Iterable<string>): string[] => [...values].sort(compareStrings)

/** Sorts a copy of `values` numerically. */
export const sortNumbers = (values: Iterable<number>): number[] => [...values].sort(compareNumbers)

/** Sorts a copy of `items` by a derived string key. */
export const sortBy = <T>(items: Iterable<T>, keyOf: (item: T) => string): T[] =>
  [...items].sort((left, right) => compareStrings(keyOf(left), keyOf(right)))
