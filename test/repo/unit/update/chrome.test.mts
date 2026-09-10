import { expect, test } from 'vitest'
import {
  chromePin,
  type ChromeChannels,
} from '../../../../scripts/repo/update/chrome.mts'
import { updateReferences } from '../../../../scripts/repo/update.mts'

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
      'wpt.mts',
      'chrome.mts',
    ])
    expect(calls.map(([, args]) => args)).toEqual(
      check ? [['--check'], ['--check']] : [[], []],
    )
  }
})
