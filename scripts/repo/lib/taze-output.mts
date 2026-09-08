// Taze can exit successfully after a registry lookup fails.
const PACKUMENT_FAILURE_PATTERN =
  /(?:Failed to fetch package|Timeout requesting) "([^"\n]+)"|^> (\S+) (?:unknown error|fetch failed|timeout)\b/gm

export function collectPackumentFailures(output: string): string[] {
  const failed = new Set<string>()
  for (const match of output.matchAll(PACKUMENT_FAILURE_PATTERN)) {
    failed.add((match[1] ?? match[2])!)
  }
  return [...failed].toSorted()
}
