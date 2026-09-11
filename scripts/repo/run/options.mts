export const RUN_HELP = `Usage: node scripts/repo/run.mts <entry> [arguments]

Runs a repository script with the repository root as its working directory.
Arguments after <entry> are forwarded unchanged. Node entries use the current
Node executable and the repository compile cache.

Examples:
  node scripts/repo/run.mts scripts/repo/test.mts --help
  node scripts/repo/run.mts scripts/repo/test.mts unit --reporter=verbose

-h, --help  Show runner help. Put help after <entry> to show that script's help.`

export function parseRunArgs(args: string[]) {
  const [entry, ...forwarded] = args
  if (entry === '--help' || entry === '-h') {
    if (forwarded.length > 0) {
      throw new Error('Runner help does not accept positional arguments.')
    }
    return { help: true as const }
  }
  if (!entry) {
    throw new Error('Missing <entry>. Run with --help for usage and examples.')
  }
  if (entry.startsWith('-')) {
    throw new Error(
      `Expected <entry> before ${JSON.stringify(entry)}. Put runner flags after the entry to forward them.`,
    )
  }
  return { args: forwarded, entry, help: false as const }
}
