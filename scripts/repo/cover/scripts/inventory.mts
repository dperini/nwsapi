import { readdirSync } from 'node:fs'
import path from 'node:path'

export function scriptInventory(root: string) {
  const directory = path.join(root, 'scripts')
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .toSorted()
  return {
    node: files.filter(file =>
      ['.mts', '.mjs', '.js'].includes(path.extname(file)),
    ),
    python: files.filter(file => path.extname(file) === '.py'),
  }
}
