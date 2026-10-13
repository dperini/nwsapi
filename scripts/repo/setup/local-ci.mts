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
    ready: false,
    message: `${localCiRuntimeGuidance(platform)} Use LOCAL_CI_DOCKER_HOST only for a custom socket path.`,
  }
}

function localCiRuntimeGuidance(platform: NodeJS.Platform) {
  if (platform === 'darwin') {
    return 'OrbStack is the recommended macOS runtime. Start it and ensure /var/run/docker.sock exists. OrbStack may ask for admin approval to create this compatibility link.'
  }
  if (platform === 'win32') {
    return 'Start Docker Desktop and ensure its Docker socket is available to this shell.'
  }
  return 'Start Docker Engine or Docker Desktop and ensure /var/run/docker.sock is available.'
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
