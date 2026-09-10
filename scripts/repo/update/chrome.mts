import { readFileSync, writeFileSync } from 'node:fs'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { fileURLToPath } from 'node:url'

export const CHROME_CHANNELS_URL =
  'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'
const pinPath = new URL('../../../.config/chrome.json', import.meta.url)
interface Channel {
  channel: string
  version: string
  downloads?: { chrome?: Array<{ platform: string; url: string }> }
}
export interface ChromeChannels {
  timestamp: string
  channels: { Stable: Channel; Beta: Channel }
}

export function chromePin(data: ChromeChannels) {
  if (!Number.isFinite(Date.parse(data.timestamp))) {
    throw new Error('Chrome channel metadata has no valid timestamp.')
  }
  for (const name of ['Stable', 'Beta'] as const) {
    const channel = data.channels?.[name]
    if (
      channel?.channel !== name ||
      !/^\d+\.\d+\.\d+\.\d+$/.test(channel.version)
    ) {
      throw new Error(`Missing or invalid Chrome ${name} version.`)
    }
    for (const platform of ['linux64', 'mac-arm64', 'mac-x64', 'win64']) {
      const expected = `https://storage.googleapis.com/chrome-for-testing-public/${channel.version}/${platform}/chrome-${platform}.zip`
      if (
        !channel.downloads?.chrome?.some(
          download =>
            download.platform === platform && download.url === expected,
        )
      ) {
        throw new Error(
          `Chrome ${name} ${channel.version} has no verified ${platform} download.`,
        )
      }
    }
  }
  const stable = data.channels.Stable.version
  const beta = data.channels.Beta.version
  if (Number(beta.split('.')[0]) < Number(stable.split('.')[0])) {
    throw new Error('Chrome Beta milestone is older than Stable.')
  }
  return {
    source: CHROME_CHANNELS_URL,
    timestamp: data.timestamp,
    channel: 'Beta',
    stable,
    beta,
    version: beta,
  }
}

export async function updateChrome(check = false) {
  const response = await fetch(CHROME_CHANNELS_URL, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Chrome channel lookup failed: HTTP ${response.status}.`)
  }
  const pin = chromePin(await response.json())
  console.log(
    `Chrome Stable ${pin.stable}; Beta ${pin.beta}. Selected Beta ${pin.version}.`,
  )
  if (check) {
    return
  }
  const contents = JSON.stringify(pin, null, 2) + '\n'
  if (readFileSync(pinPath, 'utf8') !== contents) {
    writeFileSync(pinPath, contents)
  }
  // Reload the new pin in a separate process before installing its browser.
  runNode(fileURLToPath(new URL('../browser.mts', import.meta.url)), [])
}

if (isMainModule(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) {
    throw new Error('Usage: update/chrome.mts [--check]')
  }
  await updateChrome(process.argv.includes('--check'))
}
