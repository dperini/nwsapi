import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { isLoopbackHost } from '../../../../../scripts/repo/test/network/guard.mts'
import { testNetworkEnvironment } from '../../../../../scripts/repo/test/network/run.mts'

function probe(source: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    env: testNetworkEnvironment({ ...process.env, ...extraEnv }),
    encoding: 'utf8',
  }).trim()
}

test.each([
  'localhost',
  'LOCALHOST',
  '127.0.0.1',
  '127.5.6.7',
  '::1',
  '[::1]',
  '::ffff:127.0.0.1',
])('recognizes the loopback address %s', host => {
  expect(isLoopbackHost(host)).toBe(true)
})

test.each([
  'localhost.example.org',
  '127.0.0.1.example.org',
  '128.0.0.1',
  '::',
  '192.168.1.1',
  undefined,
])('rejects the non-loopback address %s', host => {
  expect(isLoopbackHost(host)).toBe(false)
})

test.each([
  "const net = await import('node:net'); net.connect({host:'192.0.2.1',port:443})",
  "const dns = await import('node:dns'); dns.lookup('unmocked.invalid',()=>{})",
  "const dns = await import('node:dns/promises'); await dns.resolve('unmocked.invalid')",
  "const dns = await import('node:dns/promises'); await new dns.Resolver().resolve('unmocked.invalid')",
  "const dgram = await import('node:dgram'); dgram.createSocket('udp4').connect(53,'192.0.2.1')",
  "const dgram = await import('node:dgram'); dgram.createSocket('udp4').send('hello',53,'192.0.2.1')",
])('blocks native external network calls in child Node: %s', source => {
  expect(
    probe(`try { ${source} } catch(error) { console.log(error.code) }`),
  ).toBe('ERR_TEST_NETWORK_BLOCKED')
})

test('removes inherited proxy settings and rejects their loopback endpoint', () => {
  const source = `
    const net = await import('node:net')
    console.log(process.env.HTTP_PROXY === undefined)
    try { net.connect({ host: '127.0.0.1', port: 45873 }) }
    catch(error) { console.log(error.code) }
  `
  expect(
    probe(source, { HTTP_PROXY: 'http://user:secret@127.0.0.1:45873' }),
  ).toBe('true\nERR_TEST_NETWORK_BLOCKED')
})

test('localhost DNS lookup remains local', () => {
  expect(
    probe(
      "const dns = await import('node:dns/promises'); console.log((await dns.lookup('localhost')).address)",
    ),
  ).toBe('127.0.0.1')
})
