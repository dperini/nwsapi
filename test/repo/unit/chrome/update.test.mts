import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as NodeFs from 'node:fs'
import nock from 'nock'
import {
  chromePin,
  updateChrome,
  type ChromeChannels,
} from '../../../../scripts/repo/chrome/update.mts'
import { updateReferences } from '../../../../scripts/repo/dependency/update.mts'

const state = vi.hoisted(() => ({
  main: false,
  pin: '',
  write: vi.fn(),
  run: vi.fn(),
}))
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof NodeFs>()
  return {
    ...original,
    readFileSync: (file: NodeFs.PathOrFileDescriptor, options: unknown) =>
      String(file).endsWith('/.config/chrome.json')
        ? state.pin
        : original.readFileSync(
            file,
            options as Parameters<typeof original.readFileSync>[1],
          ),
    writeFileSync: state.write,
  }
})
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/scripts/repo/chrome/update.mts'),
  runNode: state.run,
}))
beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.pin = ''
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

function request() {
  return nock('https://googlechromelabs.github.io')
    .get('/chrome-for-testing/last-known-good-versions-with-downloads.json')
    .reply(200, channels())
}

function channels(): ChromeChannels {
  const channel = (name: string, version: string) => ({
    channel: name,
    version,
    downloads: {
      chrome: ['linux64', 'mac-arm64', 'mac-x64', 'win64'].map(platform => ({
        platform,
        url: `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`,
      })),
    },
  })
  return {
    timestamp: '2026-09-10T09:22:08.452Z',
    channels: {
      Stable: channel('Stable', '153.0.8010.36'),
      Beta: channel('Beta', '154.0.8037.0'),
    },
  }
}

test('Chrome discovery selects beta and records stable with upstream provenance', () => {
  const pin = chromePin(channels())
  expect(pin.channel).toBe('Beta')
  expect(pin.version).toBe('154.0.8037.0')
  expect(pin.beta).toBe(pin.version)
  expect(pin.stable).toBe('153.0.8010.36')
  expect(pin.timestamp).toBe(channels().timestamp)
})

test('Chrome discovery refuses incomplete or invalid channel metadata', () => {
  for (const alter of [
    (data: ChromeChannels) => {
      data.timestamp = 'invalid'
    },
    (data: ChromeChannels) => {
      data.channels.Beta.version = 'latest'
    },
    (data: ChromeChannels) => {
      data.channels.Beta.downloads!.chrome!.pop()
    },
    (data: ChromeChannels) => {
      data.channels.Stable.downloads!.chrome![0]!.url =
        'https://example.com/chrome.zip'
    },
  ]) {
    const data = channels()
    alter(data)
    expect(() => chromePin(data)).toThrow()
  }
})

test('update discovers WPT and Chrome in both write and preview modes', () => {
  for (const check of [false, true]) {
    const calls: Array<[string, string[]]> = []
    updateReferences(check, (entry, args = []) => {
      calls.push([entry, args])
    })
    expect(calls.map(([entry]) => entry.split('/').at(-1))).toEqual([
      'update.mts',
      'update.mts',
    ])
    expect(calls.map(([, args]) => args)).toEqual(
      check ? [['--check'], ['--check']] : [[], []],
    )
  }
})

test('missing channels and download metadata are rejected before selecting a browser', () => {
  const inputs = [
    (data: ChromeChannels) => {
      data.channels.Stable.channel = 'Beta'
    },
    (data: ChromeChannels) => {
      delete data.channels.Beta.downloads
    },
    (data: ChromeChannels) => {
      data.channels.Beta.downloads = {}
    },
    (data: ChromeChannels) => {
      data.channels = undefined as unknown as ChromeChannels['channels']
    },
  ]
  for (let i = 0, length = inputs.length; i < length; i += 1) {
    const data = channels()
    inputs[i]!(data)
    expect(() => chromePin(data)).toThrow()
  }
  const older = channels()
  older.channels.Beta = { ...older.channels.Stable, channel: 'Beta' }
  const stable = channels().channels.Beta
  older.channels.Stable = { ...stable, channel: 'Stable' }
  expect(() => chromePin(older)).toThrow()
})

test('Chrome preview reads verified upstream metadata without writing or installing', async () => {
  const requests = request()
  await updateChrome(true)
  expect(requests.isDone()).toBe(true)
  expect(state.write).not.toHaveBeenCalled()
  expect(state.run).not.toHaveBeenCalled()
})

test('Chrome updates write only changed pins and always reload the browser installer', async () => {
  const first = request()
  await updateChrome()
  expect(first.isDone()).toBe(true)
  expect(JSON.parse(state.write.mock.calls[0]![1])).toEqual(
    chromePin(channels()),
  )
  state.pin = state.write.mock.calls[0]![1]
  state.write.mockClear()
  const second = request()
  await updateChrome(false)
  expect(second.isDone()).toBe(true)
  expect(state.write).not.toHaveBeenCalled()
  expect(state.run).toHaveBeenCalledTimes(2)
})

test('upstream HTTP failure cannot update Chrome metadata', async () => {
  const requests = nock('https://googlechromelabs.github.io')
    .get('/chrome-for-testing/last-known-good-versions-with-downloads.json')
    .reply(503)
  await expect(updateChrome()).rejects.toBeInstanceOf(Error)
  expect(requests.isDone()).toBe(true)
  expect(state.write).not.toHaveBeenCalled()
})

test('the Chrome updater command supports preview mode and rejects invalid options', async () => {
  state.main = true
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv'
          ? ['node', 'update.mts', '--check']
          : Reflect.get(target, property)
      },
    }),
  )
  vi.resetModules()
  const requests = request()
  await import('../../../../scripts/repo/chrome/update.mts')
  expect(requests.isDone()).toBe(true)
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv'
          ? ['node', 'update.mts', '--invalid']
          : Reflect.get(target, property)
      },
    }),
  )
  vi.resetModules()
  await expect(
    import('../../../../scripts/repo/chrome/update.mts'),
  ).rejects.toBeInstanceOf(Error)
})
