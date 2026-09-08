/**
 * @file Colors used by Socket's package score badges.
 */

// Match the badge API in depscan: green at 80, orange at 60, and red below 60.
export function percentBadgeColor(pct: number): string {
  if (pct >= 80) {
    return '#48bb78'
  }
  if (pct >= 60) {
    return '#ed8936'
  }
  return '#f56565'
}
