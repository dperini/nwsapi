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
  const controls = new Set(['--json', '--describe', '--dry-run'])
  const options = new Set<string>()
  const scriptArgs: string[] = []
  let endOfOptions = false
  for (const argument of forwarded) {
    if (!endOfOptions && argument === '--') {
      endOfOptions = true
      scriptArgs.push(argument)
    } else if (!endOfOptions && controls.has(argument)) {
      options.add(argument)
    } else {
      scriptArgs.push(argument)
    }
  }
  if (options.has('--describe') && options.has('--dry-run')) {
    throw new Error('Choose --describe or --dry-run.')
  }
  return {
    args: scriptArgs,
    entry,
    help: false as const,
    json: options.has('--json'),
    describe: options.has('--describe'),
    dryRun: options.has('--dry-run'),
  }
}
