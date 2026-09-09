import { execFileSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from 'acorn'
import type { Node, CallExpression, ImportExpression, Literal } from 'acorn'
import { packageFiles } from '../../../.config/build.config.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

function moduleSpecifier(node: Node): Literal | undefined {
  let specifier: Node | undefined
  if (node.type === 'CallExpression') {
    const call = node as CallExpression
    if (
      call.callee.type === 'Identifier' &&
      call.callee.name === 'require' &&
      call.arguments.length === 1
    ) {
      specifier = call.arguments[0]
    }
  } else if (node.type === 'ImportExpression') {
    specifier = (node as ImportExpression).source
  }
  return specifier?.type === 'Literal' ? (specifier as Literal) : undefined
}

// Rewrite module specifiers using parsed code and the declared file mapping.
// Local dist files stay runnable while the package retains its original paths.
export function relocateImports(
  source: string,
  output: string,
  published: string,
) {
  const mappings = new Map(
    packageFiles.map(file => [file.output, file.published]),
  )
  const changes: Array<{ start: number; end: number; text: string }> = []
  function visit(node: Node) {
    const specifier = moduleSpecifier(node)
    if (specifier?.type === 'Literal') {
      const value = specifier.value
      if (typeof value === 'string' && value.startsWith('.')) {
        const target = mappings.get(
          path.posix.join(path.posix.dirname(output), value),
        )
        if (target) {
          const relative = path.posix.relative(
            path.posix.dirname(published),
            target,
          )
          changes.push({
            start: specifier.start,
            end: specifier.end,
            text: JSON.stringify(
              relative.startsWith('.') ? relative : './' + relative,
            ),
          })
        }
      }
    }
    for (const value of Object.values(node)) {
      const children = Array.isArray(value) ? value : [value]
      for (const child of children) {
        if (
          child &&
          typeof child === 'object' &&
          typeof child.type === 'string'
        ) {
          visit(child as Node)
        }
      }
    }
  }
  visit(
    parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowHashBang: true,
    }),
  )
  for (const change of changes.toSorted((a, b) => b.start - a.start)) {
    source =
      source.slice(0, change.start) + change.text + source.slice(change.end)
  }
  return source
}

export async function stagePackage(root = REPO_ROOT) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nwsapi-package-'))
  try {
    for (const file of packageFiles) {
      const destination = path.join(directory, file.published)
      await mkdir(path.dirname(destination), { recursive: true })
      if (file.output.endsWith('.js')) {
        const source = await readFile(path.join(root, file.output), 'utf8')
        await writeFile(
          destination,
          relocateImports(source, file.output, file.published),
          {
            mode: file.published.startsWith('bin/') ? 0o755 : 0o644,
          },
        )
      } else {
        await copyFile(path.join(root, file.output), destination)
      }
    }
    for (const name of ['LICENSE', 'README.md']) {
      await copyFile(path.join(root, name), path.join(directory, name))
    }
    const manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    )
    manifest.main = './src/nwsapi'
    manifest.bin = { nwsapi: './bin/nwsapi.js' }
    manifest.files = packageFiles.map(file => file.published)
    for (const key of [
      'scripts',
      'devDependencies',
      'devEngines',
      'allowScripts',
    ]) {
      delete manifest[key]
    }
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    )
    return directory
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function packPackage(destination: string, root = REPO_ROOT) {
  const directory = await stagePackage(root)
  try {
    await mkdir(destination, { recursive: true })
    const cli = process.env['npm_execpath'] || 'pnpm'
    const javascript = /\.[cm]?js$/.test(cli)
    const response = JSON.parse(
      execFileSync(
        javascript ? process.execPath : cli,
        [
          ...(javascript ? [cli] : []),
          '--reporter=silent',
          '--config.ignore-scripts=true',
          'pack',
          '--json',
          '--pack-destination',
          path.resolve(destination),
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      ),
    )
    return Array.isArray(response) ? response[0] : response.nwsapi || response
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: { 'pack-destination': { type: 'string', default: 'dist' } },
  })
  console.log(
    JSON.stringify(
      await packPackage(path.resolve(values['pack-destination'])),
      null,
      2,
    ),
  )
}
