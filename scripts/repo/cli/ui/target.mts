export type OpenTuiTarget = {
  platform: NodeJS.Platform
  arch: string
  libc?: 'glibc' | 'musl'
}

type RuntimeReport = Pick<typeof process.report, 'getReport'>

export function detectLinuxLibc(env: NodeJS.ProcessEnv, report: RuntimeReport) {
  const override = env['OPENTUI_LIBC']
  if (override === 'glibc' || override === 'musl') {
    return override
  }
  if (override !== undefined) {
    throw new Error('OPENTUI_LIBC must be glibc or musl.')
  }
  try {
    const value = report.getReport() as {
      header?: { glibcVersionRuntime?: string }
    }
    return value.header?.glibcVersionRuntime ? 'glibc' : 'musl'
  } catch {
    return 'musl'
  }
}

export function currentOpenTuiTarget(
  platform = process.platform,
  arch = process.arch,
  env: NodeJS.ProcessEnv = process.env,
  report: RuntimeReport = process.report,
): OpenTuiTarget {
  if (!['darwin', 'linux', 'win32'].includes(platform)) {
    throw new Error(`OpenTUI does not support ${platform}.`)
  }
  if (!['x64', 'arm64'].includes(arch)) {
    throw new Error(`OpenTUI does not support ${arch}.`)
  }
  if (platform === 'linux') {
    return { platform, arch, libc: detectLinuxLibc(env, report) }
  }
  return { platform, arch }
}
