import dgram from 'node:dgram'
import dns from 'node:dns'
import dnsPromises from 'node:dns/promises'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import process from 'node:process'

// Adapted from the wheelhouse network preload. Keep native child processes separately isolated.
type ConnectOptions = {
  host?: string
  port?: number
  path?: string
  family?: number
}

const originalConnect = Reflect.get(
  net.Socket.prototype,
  'connect',
) as typeof net.Socket.prototype.connect
const inheritedProxyEndpoints = new Set<string>()
const proxyKeys = new Set([
  'all_proxy',
  'cargo_http_proxy',
  'ftp_proxy',
  'global_agent_http_proxy',
  'global_agent_https_proxy',
  'http_proxy',
  'https_proxy',
  'npm_config_http_proxy',
  'npm_config_https_proxy',
  'npm_config_proxy',
  'pip_proxy',
])

function proxyEndpointKey(host: unknown, port: unknown) {
  const normalized = String(host)
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return `${isLoopbackHost(normalized) ? 'loopback' : normalized}:${Number(port)}`
}

const environmentKeys = Object.keys(process.env)
for (let index = 0, { length } = environmentKeys; index < length; index += 1) {
  const key = environmentKeys[index]!
  if (key.toLowerCase() === 'node_use_env_proxy') {
    delete process.env[key]
  } else if (proxyKeys.has(key.toLowerCase())) {
    const value = process.env[key]
    delete process.env[key]
    if (!value) {
      continue
    }
    try {
      const proxy = new URL(value.includes('://') ? value : `http://${value}`)
      const port =
        proxy.port ||
        (proxy.protocol === 'https:'
          ? '443'
          : proxy.protocol.startsWith('socks')
            ? '1080'
            : '80')
      inheritedProxyEndpoints.add(proxyEndpointKey(proxy.hostname, port))
    } catch {
      // Invalid proxy configuration is removed without exposing credentials.
    }
  }
}

export function isLoopbackHost(host: unknown) {
  if (typeof host !== 'string') {
    return false
  }
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::1' || normalized === 'localhost') {
    return true
  }
  const address = normalized.startsWith('::ffff:')
    ? normalized.slice(7)
    : normalized
  return net.isIP(address) === 4 && address.startsWith('127.')
}

function socketConnectOptions(args: unknown[]): ConnectOptions {
  const first = args[0]
  if (typeof first === 'object' && first !== null) {
    return first as ConnectOptions
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) {
    return { path: first }
  }
  return {
    port: first as number,
    host: typeof args[1] === 'string' ? args[1] : 'localhost',
  }
}

function normalizedSocketConnectOptions(options: ConnectOptions) {
  const connectOptions = { ...options }
  if (
    !connectOptions.path &&
    (connectOptions.host ?? 'localhost').toLowerCase() === 'localhost'
  ) {
    connectOptions.host = connectOptions.family === 6 ? '::1' : '127.0.0.1'
  }
  return connectOptions
}

net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const normalized = Array.isArray(args[0]) ? args[0] : args
  const options = socketConnectOptions(normalized)
  if (!options.path && !isLoopbackHost(options.host ?? 'localhost')) {
    throw Object.assign(
      new Error(
        'External test network blocked. Where: Socket.connect. Saw: non-loopback host; wanted a local fixture. Fix: mock the external service.',
      ),
      { code: 'ERR_TEST_NETWORK_BLOCKED' },
    )
  }
  if (
    !options.path &&
    inheritedProxyEndpoints.has(
      proxyEndpointKey(options.host ?? 'localhost', options.port),
    )
  ) {
    throw blockedNetworkError('inherited proxy connection')
  }
  const connectOptions = normalizedSocketConnectOptions(options)
  const callback = normalized.find(value => typeof value === 'function')
  return Reflect.apply(originalConnect, this, [connectOptions, callback])
} as typeof originalConnect

function blockedNetworkError(boundary: string) {
  return Object.assign(
    new Error(
      `External test network blocked. Where: ${boundary}. Saw: network resolution or non-loopback address; wanted a local fixture. Fix: mock the external service.`,
    ),
    { code: 'ERR_TEST_NETWORK_BLOCKED' },
  )
}

function guardDnsApi(target: object, promises: boolean) {
  const api = target as Record<string, unknown>
  for (const name of Object.getOwnPropertyNames(api)) {
    if (
      !name.startsWith('resolve') &&
      name !== 'reverse' &&
      name !== 'lookupService' &&
      name !== 'lookup'
    ) {
      continue
    }
    const original = api[name]
    if (typeof original !== 'function') {
      continue
    }
    function invoke(this: unknown, ...args: unknown[]) {
      if (
        name !== 'lookup' ||
        (!isLoopbackHost(args[0]) &&
          (typeof args[0] !== 'string' || net.isIP(args[0]) === 0))
      ) {
        throw blockedNetworkError(`dns.${name}`)
      }
      if (
        typeof args[0] === 'string' &&
        args[0].toLowerCase() === 'localhost'
      ) {
        const family =
          typeof args[1] === 'number'
            ? args[1]
            : (args[1] as { family?: number } | undefined)?.family
        args[0] = family === 6 ? '::1' : '127.0.0.1'
      }
      return Reflect.apply(
        original as (...values: unknown[]) => unknown,
        this,
        args,
      )
    }
    api[name] = promises
      ? async function (this: unknown, ...args: unknown[]) {
          return Reflect.apply(invoke, this, args)
        }
      : invoke
  }
}

guardDnsApi(dns, false)
guardDnsApi(dnsPromises, true)
guardDnsApi(dns.Resolver.prototype, false)
guardDnsApi(dnsPromises.Resolver.prototype, true)

const originalDatagramConnect = Reflect.get(
  dgram.Socket.prototype,
  'connect',
) as typeof dgram.Socket.prototype.connect
const originalDatagramSend = Reflect.get(
  dgram.Socket.prototype,
  'send',
) as typeof dgram.Socket.prototype.send

dgram.Socket.prototype.connect = function (
  this: dgram.Socket,
  port: number,
  address?: string,
  callback?: () => void,
) {
  if (typeof address === 'string' && !isLoopbackHost(address)) {
    throw blockedNetworkError('dgram.connect')
  }
  return Reflect.apply(originalDatagramConnect, this, [port, address, callback])
} as typeof originalDatagramConnect

dgram.Socket.prototype.send = function (
  this: dgram.Socket,
  ...args: unknown[]
) {
  const addressIndex =
    typeof args[1] === 'number' && typeof args[2] === 'number' ? 4 : 2
  const address = args[addressIndex]
  if (typeof address === 'string' && !isLoopbackHost(address)) {
    throw blockedNetworkError('dgram.send')
  }
  return Reflect.apply(originalDatagramSend, this, args)
} as typeof originalDatagramSend

syncBuiltinESMExports()
