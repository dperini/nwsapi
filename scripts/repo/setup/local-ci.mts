import { accessSync, constants } from 'node:fs'
import type { CheckoutReadiness } from './readiness.mts'

export function localCiStatus(
  readiness: CheckoutReadiness,
  dockerSocketAvailable: boolean,
  platform: NodeJS.Platform = process.platform,
) {
  const setup = taskStatus(readiness)
  if (!setup.ready || dockerSocketAvailable) {
    return setup
  }
  return {
    ready: true,
    message: `${localCiRuntimeGuidance(platform)} Running this task will check, start, or install the runtime.`,
  }
}

function localCiRuntimeGuidance(platform: NodeJS.Platform) {
  if (platform === 'darwin') {
    return 'macOS setup checks OrbStack and Docker first, then installs OrbStack if neither is available.'
  }
  if (platform === 'win32') {
    return 'Windows setup checks Docker first, then installs Docker Desktop if it is unavailable.'
  }
  return 'Linux setup checks Docker first, then installs Docker Engine with Docker’s official installer if it is unavailable.'
}

function taskStatus(readiness: CheckoutReadiness) {
  const issues: string[] = []
  if (!readiness.tools.ready) {
    issues.push('Pinned checkout tools are not ready.')
  }
  issues.push(...readiness.dependencies.issues)
  if (issues.length === 0) {
    return { ready: true, message: '' }
  }
  return {
    ready: false,
    message: `${issues.join(' ')} Run node scripts/repo/setup/bootstrap.mts, then retry.`,
  }
}

export function hasLocalCiDockerSocket() {
  const host = process.env['LOCAL_CI_DOCKER_HOST']?.trim()
  const socket = host?.startsWith('unix://')
    ? host.slice('unix://'.length)
    : host
      ? undefined
      : '/var/run/docker.sock'
  if (socket === undefined) {
    return Boolean(host)
  }
  try {
    accessSync(socket, constants.R_OK | constants.W_OK)
    return true
  } catch {
    return false
  }
}
