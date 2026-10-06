import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { format } from 'oxfmt'
import type { FormatConfig } from 'oxfmt'
import { parse } from '@ultrathink/acorn.rs.wasm'
import formatterConfig from '../../../.config/oxfmt.json' with { type: 'json' }
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

const MODEL_DIR = path.join(REPO_ROOT, 'assets/repo/pytorch/model')
const OUTPUT = path.join(
  REPO_ROOT,
  'src/core/select/has/route-decision.generated.mts',
)

type AstNode = {
  end: number
  id?: AstNode
  name?: string
  params?: AstNode[]
  body?: AstNode
  start: number
  type: string
  [key: string]: unknown
}

function walk(node: AstNode, visit: (node: AstNode) => void) {
  visit(node)
  const values = Object.values(node)
  const valueCount = values.length
  for (let valueIndex = 0; valueIndex < valueCount; valueIndex += 1) {
    const value = values[valueIndex]
    if (Array.isArray(value)) {
      const childCount = value.length
      for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
        const child = value[childIndex]
        if (child && typeof child === 'object' && 'type' in child) {
          walk(child as AstNode, visit)
        }
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      walk(value as AstNode, visit)
    }
  }
}

function modelSource(modelDirectory: string, host: 'chromium' | 'jsdom') {
  const file = path.join(modelDirectory, `${host}.generated.mjs`)
  const source = readFileSync(file, 'utf8').trim()
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }) as unknown as AstNode
  const functions = new Map<string, AstNode>()
  walk(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      functions.set(node.id.name, node)
    }
  })
  if (!functions.has('dispatchOverride')) {
    throw new Error(`Unexpected ${host} policy export in ${file}`)
  }
  const expectedParameters = new Map([
    ['supportedCategory', 2],
    ['supportedRoute', 3],
    ['inRange', 3],
    ['supportedInputs', 5],
    ['dispatchOverride', 5],
  ])
  const expectedEntries = Array.from(expectedParameters.entries())
  const expectedCount = expectedEntries.length
  for (let index = 0; index < expectedCount; index += 1) {
    const [name, count] = expectedEntries[index]!
    if (functions.get(name)?.params?.length !== count) {
      throw new Error(`Unexpected ${host} policy signature in ${file}`)
    }
  }

  const functionNodes = Array.from(functions.values())
  const functionCount = functionNodes.length
  let firstFunction = Number.POSITIVE_INFINITY
  for (let index = 0; index < functionCount; index += 1) {
    firstFunction = Math.min(firstFunction, functionNodes[index]!.start)
  }
  let typed = source.slice(firstFunction)
  const edits: Array<{ start: number; end: number; value: string }> = []
  const helperNames = new Map([
    ['supportedCategory', `${host}SupportedCategory`],
    ['supportedRoute', `${host}SupportedRoute`],
    ['inRange', `${host}InRange`],
    ['supportedInputs', `${host}SupportedInputs`],
  ])
  walk(ast, node => {
    const generatedName = node.name && helperNames.get(node.name)
    if (node.type === 'Identifier' && generatedName) {
      edits.push({
        start: node.start - firstFunction,
        end: node.end - firstFunction,
        value: generatedName,
      })
    }
  })
  const functionEntries = Array.from(functions.entries())
  const entryCount = functionEntries.length
  for (let index = 0; index < entryCount; index += 1) {
    const [name, node] = functionEntries[index]!
    const id = node.id!
    if (name === 'dispatchOverride') {
      edits.push({
        start: id.start - firstFunction,
        end: id.end - firstFunction,
        value: `${host}Policy`,
      })
    }
    const parameters = node.params ?? []
    const parameterCount = parameters.length
    for (
      let parameterIndex = 0;
      parameterIndex < parameterCount;
      parameterIndex += 1
    ) {
      const parameter = parameters[parameterIndex]!
      if (parameter.type !== 'Identifier') {
        throw new Error(`Unexpected ${host} policy parameter in ${file}`)
      }
      edits.push({
        start: parameter.end - firstFunction,
        end: parameter.end - firstFunction,
        value: ': number',
      })
    }
    if (!node.body) {
      throw new Error(`Unexpected ${host} policy body in ${file}`)
    }
    edits.push({
      start: node.body.start - firstFunction,
      end: node.body.start - firstFunction,
      value: ': boolean ',
    })
  }
  const orderedEdits = edits.toSorted((left, right) => right.start - left.start)
  const editCount = orderedEdits.length
  for (let index = 0; index < editCount; index += 1) {
    const edit = orderedEdits[index]!
    typed = typed.slice(0, edit.start) + edit.value + typed.slice(edit.end)
  }
  return typed
}

export async function renderHasRouteDecision(modelDirectory = MODEL_DIR) {
  const metadata = readFileSync(path.join(modelDirectory, 'model.txt'), 'utf8')
  const modelId = /^model-id: ([a-z0-9-]+)$/m.exec(metadata)?.[1]
  if (!modelId) {
    throw new Error('Model metadata must include a `model-id` entry.')
  }
  return [
    '// Generated by scripts/repo/gen/has-route-decision.mts. Do not edit.',
    `export const hasRouteDecisionModelId = ${JSON.stringify(modelId)} as const`,
    modelSource(modelDirectory, 'chromium'),
    modelSource(modelDirectory, 'jsdom'),
    '',
  ].join('\n\n')
}

export async function writeHasRouteDecision(
  options: {
    check?: boolean
    modelDirectory?: string
    output?: string
  } = {},
) {
  const { check = false, modelDirectory = MODEL_DIR, output = OUTPUT } = options
  const source = await renderHasRouteDecision(modelDirectory)
  const result = await format(output, source, formatterConfig as FormatConfig)
  if (result.errors.length) {
    throw new Error(result.errors.map(error => error.message).join('\n'))
  }
  const formatted = result.code
  if (check) {
    const current = readFileSync(output, 'utf8')
    if (current !== formatted) {
      throw new Error(
        `${path.relative(REPO_ROOT, output)} is stale; run gen:has-route-decision.`,
      )
    }
    return
  }
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, formatted)
}

if (isMainModule(import.meta.url)) {
  await writeHasRouteDecision({ check: process.argv.includes('--check') })
}
