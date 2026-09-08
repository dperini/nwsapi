/**
 * @file Socket semantic colors for generated percentage badges.
 */

// Keep score colors in one place for coverage and other percentage badges.
export function percentBadgeColor(pct: number): string {
  if (pct >= 90) {
    return '#16a34a'
  }
  if (pct >= 80) {
    return '#22c55e'
  }
  if (pct >= 70) {
    return '#eab308'
  }
  if (pct >= 60) {
    return '#facc15'
  }
  if (pct >= 50) {
    return '#ea580c'
  }
  return '#dc2626'
}

// Dark value text keeps the green, yellow, and orange fills readable.
export function percentBadgeTextColor(color: string): string {
  return color === '#9f9f9f' || color === '#dc2626' ? '#fff' : '#111'
}
