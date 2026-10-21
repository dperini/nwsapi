import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const TSRSLINT_PLATFORMS = new Set(['linux-arm64', 'linux-x64', 'darwin-arm64'])

export function lintBinary(
  platform = process.platform,
  arch = process.arch,
  resolve: (packageName: string) => string = name => require.resolve(name),
  resolveTsrslint: () => string = () =>
    require('@maschwenk/tsrslint').binaryPath() as string,
) {
  if (TSRSLINT_PLATFORMS.has(`${platform}-${arch}`)) {
    return resolveTsrslint()
  }
  const suffix = platform === 'win32' ? '.exe' : ''
  return resolve(
    `@maschwenk/oxlint-tsgolint-${platform}-${arch}/tsgolint${suffix}`,
  )
}
