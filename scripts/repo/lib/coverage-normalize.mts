/**
 * Canonical JSON for coverage locations and persisted coverage reports.
 */
export function coverageLocationKey(value: unknown): string {
  // JSON represents non-finite column endpoints as null. Apply that same
  // representation to live reports before a merger indexes their locations.
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)),
      )
    }
    return item
  })
}

/**
 * Return a detached report with stable keys and JSON-normalized endpoints.
 * Call before accumulating live converter output with reports read from disk.
 */
export function normalizeCoverageLocations<T extends object>(report: T): T {
  return JSON.parse(coverageLocationKey(report)) as T
}
