import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from '@ultrathink/acorn.rs.wasm'
import { isMainModule } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'

type LooseNode = { type: string; [key: string]: unknown }

export interface ScriptEntrypoint {
  file: string
  packageScripts: string[]
  guarded: boolean
  help: boolean
}

function walk(node: LooseNode, visit: (node: LooseNode) => void) {
  visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          walk(child as LooseNode, visit)
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      walk(value as LooseNode, visit)
    }
  }
}

function staticName(node: unknown) {
  if (!node || typeof node !== 'object') {
    return undefined
  }
  const value = node as LooseNode
  if (value.type === 'Identifier') {
    return value['name'] as string
  }
  if (value.type === 'Literal') {
    return value['value'] as string
  }
  return undefined
}

export function inspectEntrypointSource(source: string) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    typescript: true,
  }) as unknown as LooseNode
  let guarded = false
  let help = false
  walk(ast, node => {
    if (node.type !== 'CallExpression') {
      return
    }
    const callee = node['callee'] as LooseNode | undefined
    if (staticName(callee) === 'isMainModule') {
      guarded = true
    }
    if (!callee || callee.type !== 'MemberExpression') {
      return
    }
    if (staticName(callee['property']) !== 'includes') {
      return
    }
    const args = node['arguments'] as LooseNode[] | undefined
    const argument = args?.[0]
    if (
      argument?.type === 'Literal' &&
      (argument['value'] === '--help' || argument['value'] === '-h')
    ) {
      help = true
    }
  })
  return { guarded, help }
}

function quotedCharacter(command: string, index: number, quote: string) {
  const char = command[index]!
  if (char === quote) {
    return { char: '', index, quote: '' }
  }
  if (char === '\\' && quote === '"') {
    return { char: command[index + 1] || '', index: index + 1, quote }
  }
  return { char, index, quote }
}

function shellWords(command: string) {
  const words: string[] = []
  let quote = ''
  let word = ''
  for (let index = 0; index < command.length; index++) {
    const char = command[index]!
    if (quote) {
      const consumed = quotedCharacter(command, index, quote)
      word += consumed.char
      quote = consumed.quote
      index = consumed.index
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (/\s|[;&|]/.test(char)) {
      if (word) {
        words.push(word)
      }
      word = ''
    } else {
      word += char
    }
  }
  if (quote) {
    throw new Error('Unclosed quote in package command')
  }
  if (word) {
    words.push(word)
  }
  return words
}

export function runnerTargets(command: string) {
  const words = shellWords(command)
  const targets: string[] = []
  for (let index = 0; index < words.length - 2; index++) {
    if (
      words[index] === 'node' &&
      words[index + 1] === 'scripts/repo/run.mts'
    ) {
      targets.push(words[index + 2]!)
    }
  }
  return targets
}

function scriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return scriptFiles(file)
    }
    return entry.isFile() && entry.name.endsWith('.mts') ? [file] : []
  })
}

function recordPackageTarget(
  root: string,
  name: string,
  target: string,
  commands: Map<string, string[]>,
  errors: string[],
) {
  if (!target.endsWith('.mts') || target.startsWith('node_modules/')) {
    return
  }
  const absolute = path.resolve(root, target)
  const relative = path.relative(root, absolute).replaceAll('\\', '/')
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    errors.push(`${name}: target leaves the repository: ${target}`)
  } else if (!existsSync(absolute)) {
    errors.push(`${name}: target does not exist: ${target}`)
  } else {
    commands.set(relative, [...(commands.get(relative) || []), name])
  }
}

function guardedFiles(root: string, errors: string[]) {
  const files: string[] = []
  for (const absolute of scriptFiles(path.join(root, 'scripts/repo'))) {
    const relative = path.relative(root, absolute).replaceAll('\\', '/')
    try {
      if (inspectEntrypointSource(readFileSync(absolute, 'utf8')).guarded) {
        files.push(relative)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${relative}: ${message}`)
    }
  }
  return files
}

export function discoverScriptEntrypoints(root = REPO_ROOT) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> }
  const commands = new Map<string, string[]>()
  const errors: string[] = []
  for (const [name, command] of Object.entries(manifest.scripts || {})) {
    for (const target of runnerTargets(command)) {
      recordPackageTarget(root, name, target, commands, errors)
    }
  }
  const files = new Set(commands.keys())
  for (const file of guardedFiles(root, errors)) {
    files.add(file)
  }
  const entrypoints: ScriptEntrypoint[] = []
  for (const file of [...files].toSorted()) {
    const inspected = inspectEntrypointSource(
      readFileSync(path.join(root, file), 'utf8'),
    )
    entrypoints.push({
      file,
      packageScripts: (commands.get(file) || []).toSorted(),
      ...inspected,
    })
  }
  return { entrypoints, errors: errors.toSorted() }
}

export function checkScriptEntrypoints(root = REPO_ROOT) {
  const report = discoverScriptEntrypoints(root)
  if (report.errors.length) {
    throw new Error(report.errors.join('\n'))
  }
  return report
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(`Usage: pnpm run check:script-entrypoints [options]
--check  Fail when a package command has a missing or unsafe local target.
--json   Print the complete entrypoint inventory as JSON.
-h, --help  Show this help.`)
  } else {
    const report = values.check
      ? checkScriptEntrypoints()
      : discoverScriptEntrypoints()
    if (values.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      const packageEntries = report.entrypoints.filter(
        entry => entry.packageScripts.length,
      ).length
      const helpEntries = report.entrypoints.filter(entry => entry.help).length
      console.log(
        `${report.entrypoints.length} entrypoints: ${packageEntries} package targets, ${helpEntries} with structural help.`,
      )
      for (const error of report.errors) {
        console.error(error)
      }
      if (report.errors.length) {
        process.exitCode = 1
      }
    }
  }
}
