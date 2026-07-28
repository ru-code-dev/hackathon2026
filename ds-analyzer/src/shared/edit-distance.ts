/**
 * Levenshtein distance.
 *
 * Shared between prop-value suggestions and the custom-component name heuristic. Small
 * inputs only (identifiers, variant names); no banding needed.
 */
export const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0
    previous[0] = i

    for (let j = 1; j <= right.length; j += 1) {
      const current = previous[j] ?? 0
      previous[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
      diagonal = current
    }
  }

  return previous[right.length] ?? 0
}
