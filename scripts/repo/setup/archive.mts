import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from 'node:fs'
import path from 'node:path'
import { resolvePowerShell } from './prerequisites.mts'

export function extractArchive(asset: string, directory: string) {
  if (!asset.endsWith('.zip')) {
    execFileSync('tar', ['-xf', asset], { cwd: directory, stdio: 'inherit' })
  } else if (process.platform === 'win32') {
    execFileSync(
      resolvePowerShell(),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Expand-Archive -LiteralPath $env:NWSAPI_TOOL_ARCHIVE -DestinationPath $env:NWSAPI_TOOL_DIRECTORY -Force',
      ],
      {
        cwd: directory,
        stdio: 'inherit',
        env: {
          ...process.env,
          NWSAPI_TOOL_ARCHIVE: path.join(directory, asset),
          NWSAPI_TOOL_DIRECTORY: directory,
        },
      },
    )
  } else {
    execFileSync('unzip', ['-q', asset, '-d', directory], {
      cwd: directory,
      stdio: 'inherit',
    })
  }
}

export function treeDigest(
  directory: string,
  platform = process.platform,
): string {
  const hash = createHash('sha256')
  for (const name of readdirSync(directory).toSorted()) {
    const file = path.join(directory, name)
    const stat = lstatSync(file)
    const kind = stat.isSymbolicLink()
      ? 'link'
      : stat.isDirectory()
        ? 'directory'
        : 'file'
    const value = stat.isSymbolicLink()
      ? readlinkSync(file)
      : stat.isDirectory()
        ? treeDigest(file, platform)
        : readFileSync(file)
    hash.update(name + '\0' + kind + '\0')
    if (platform !== 'win32') {
      hash.update(stat.mode + '\0')
    }
    // A fixed-length digest prevents file content from imitating another entry.
    hash.update(createHash('sha256').update(value).digest())
  }
  return hash.digest('hex')
}

export function matchesArchive(
  directory: string,
  extracted: string,
  platform = process.platform,
) {
  return (
    existsSync(directory) &&
    !lstatSync(directory).isSymbolicLink() &&
    treeDigest(directory, platform) === treeDigest(extracted, platform)
  )
}
