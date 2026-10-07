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

export function extractArchive(asset, directory) {
  if (!asset.endsWith('.zip')) {
    execFileSync('tar', ['-xf', asset], { cwd: directory, stdio: 'inherit' })
  } else if (process.platform === 'win32') {
    execFileSync(
      'powershell',
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

export function treeDigest(directory) {
  const hash = createHash('sha256')
  const names = readdirSync(directory).toSorted()
  for (let i = 0, length = names.length; i < length; i += 1) {
    const name = names[i]
    const file = path.join(directory, name)
    const stat = lstatSync(file)
    const value = stat.isSymbolicLink()
      ? readlinkSync(file)
      : stat.isDirectory()
        ? treeDigest(file)
        : readFileSync(file)
    hash.update(name + '\0' + stat.mode + '\0')
    // A fixed-length digest prevents file content from imitating another entry.
    hash.update(createHash('sha256').update(value).digest())
  }
  return hash.digest('hex')
}

export function matchesArchive(directory, extracted) {
  return (
    existsSync(directory) &&
    !lstatSync(directory).isSymbolicLink() &&
    treeDigest(directory) === treeDigest(extracted)
  )
}
