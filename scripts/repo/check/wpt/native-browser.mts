// ChromeDriver merges feature lists, so empty CLI values cannot clear WPT's
// overrides. Filter the final argv immediately before exec'ing Chrome.
const featureFlags = [
  '--enable-features',
  '--disable-features',
  '--enable-blink-features',
  '--disable-blink-features',
  '--enable-experimental-web-platform-features',
  '--enable-blink-test-features',
]

export function nativeBrowserArgs(args: string[]) {
  return args.filter(
    arg =>
      !featureFlags.some(flag => arg === flag || arg.startsWith(flag + '=')),
  )
}

export function nativeBrowserLauncher(executable: string) {
  const quoted = "'" + executable.replaceAll("'", "'\\''") + "'"
  const patterns = featureFlags.flatMap(flag => [flag, flag + '=*']).join('|')
  // Bash preserves ChromeDriver's inherited debugging pipes on descriptors 3 and 4.
  // Node initializes its own descriptors before execve and closes those pipes.
  return `#!/bin/bash
args=()
for arg in "$@"; do
  case "$arg" in
    ${patterns}) ;;
    *) args+=("$arg") ;;
  esac
done
exec ${quoted} "\${args[@]}"
`
}
