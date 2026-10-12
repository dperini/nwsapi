import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { downloadArchive } from '../setup/download.mts'

export const VIDEO_PROJECT = path.join(
  REPO_ROOT,
  manifest.tools.fframes.project,
)
export const VIDEO_CACHE = path.join(REPO_ROOT, '.cache', 'fframes')

export async function prepareVideo() {
  const pin = manifest.tools.fframes
  const cargo = readFileSync(path.join(VIDEO_PROJECT, 'Cargo.toml'), 'utf8')
  const lock = readFileSync(path.join(VIDEO_PROJECT, 'Cargo.lock'), 'utf8')
  const checksum = Buffer.from(pin.integrity.split('-')[1]!, 'base64').toString(
    'hex',
  )
  if (
    !cargo.includes(`fframes = { version = "=${pin.version}"`) ||
    !lock.includes(
      `name = "fframes"\nversion = "${pin.version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "${checksum}"`,
    )
  ) {
    throw new Error(
      'The fframes manifest, Cargo dependency, and lock must agree.',
    )
  }
  const archive = `${pin.package}-${pin.version}.crate`
  const bytes = await downloadArchive(
    `https://static.crates.io/crates/${pin.package}/${archive}`,
    pin.integrity,
    path.join(VIDEO_CACHE, 'archives'),
  )
  mkdirSync(VIDEO_CACHE, { recursive: true })
  writeFileSync(path.join(VIDEO_CACHE, archive), bytes)
  console.log(`Video source ready: ${pin.package} ${pin.version}`)
}

if (isMainModule(import.meta.url)) {
  await prepareVideo()
}
