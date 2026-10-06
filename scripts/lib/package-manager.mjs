export function packageManagerNotice(version, userAgent) {
  const manager = userAgent?.split(/[ /]/, 1)[0]
  if (!manager) return undefined

  const expected = /-prerelease(?:\.|$)/i.test(version) ? 'pnpm' : 'npm'
  if (manager === expected) return undefined

  return expected === 'npm'
    ? 'Use npm for stable v2 installs. Run `npm install`.'
    : 'This prerelease branch is maintained with pnpm. Run `pnpm install`.'
}
