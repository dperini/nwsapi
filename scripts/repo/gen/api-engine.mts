import type {
  AssignmentExpression,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  MemberExpression,
  Node,
  ObjectExpression,
  Property,
} from 'acorn'
import { parse } from 'acorn'
import { readFileSync, readdirSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { ENGINE_SOURCE_PATH } from '../lib/paths.mts'
import { walk } from './api-descriptions.mts'

export interface ApiSource {
  file: string
  text: string
}
export interface ApiDefinition extends ApiSource {
  node: Node
}

export function readEngineSources(): ApiSource[] {
  const directory = path.dirname(ENGINE_SOURCE_PATH)
  return readdirSync(directory)
    .filter(name => name.endsWith('.mts') && name !== 'nwsapi.mts')
    .map(name => ({
      file: `src/core/${name}`,
      text: readFileSync(path.join(directory, name), 'utf8'),
    }))
}

export function engineDefinitions(sources: ApiSource[]) {
  const functions = new Map<string, ApiDefinition>()
  const assignments = new Map<string, ApiDefinition>()
  for (const input of sources) {
    const source = { ...input, text: stripTypeScriptTypes(input.text) }
    const program = parse(source.text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    for (const node of program.body) {
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id
      ) {
        functions.set(node.declaration.id.name, {
          ...source,
          node: node.declaration,
        })
      }
    }
    for (const node of walk(program)) {
      if (node.type !== 'AssignmentExpression') {
        continue
      }
      const assignment = node as AssignmentExpression
      const target = assignment.left
      if (
        target.type === 'MemberExpression' &&
        target.object.type === 'Identifier' &&
        target.object.name === 'engine' &&
        target.property.type === 'Identifier' &&
        !target.computed
      ) {
        // Initializers define the API. Runtime changes must not replace its declaration.
        if (ownsDeclaration(assignments, target.property.name, source.file)) {
          assignments.set(target.property.name, {
            ...source,
            node: assignment.right,
          })
        }
      }
    }
  }
  function object(name: string) {
    const definition = assignments.get(name)
    if (definition?.node.type !== 'ObjectExpression') {
      throw new Error(`Missing ${name} export object`)
    }
    return (definition.node as ObjectExpression).properties
      .map(prop => {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') {
          throw new Error(`Unsupported ${name} member`)
        }
        return {
          ...definition,
          node: prop as Property & { key: { name: string } },
        }
      })
      .toSorted((a, b) => a.node.key.name.localeCompare(b.node.key.name, 'en'))
  }
  function resolve(definition: ApiDefinition): ApiDefinition {
    const node = definition.node
    if (node.type === 'MemberExpression') {
      const member = node as MemberExpression
      if (
        member.object.type === 'Identifier' &&
        member.object.name === 'engine' &&
        member.property.type === 'Identifier'
      ) {
        const assigned = assignments.get(member.property.name)
        return assigned ? resolve(assigned) : definition
      }
    }
    if (node.type === 'CallExpression') {
      const call = node as CallExpression
      if (
        call.callee.type === 'MemberExpression' &&
        call.callee.object.type === 'Identifier' &&
        call.callee.property.type === 'Identifier' &&
        call.callee.property.name === 'bind'
      ) {
        return functions.get(call.callee.object.name) || definition
      }
    }
    return definition
  }
  return { object, resolve }
}

export function engineSignature(name: string, definition: ApiDefinition) {
  const { node, text } = definition
  if (
    node.type !== 'FunctionDeclaration' &&
    node.type !== 'FunctionExpression'
  ) {
    return name
  }
  const fn = node as FunctionDeclaration | FunctionExpression
  const params =
    fn.type === 'FunctionDeclaration' ? fn.params.slice(1) : fn.params
  return `${name}(${params.map(param => text.slice(param.start, param.end).replace(/\s+/g, ' ')).join(', ')})`
}

function ownsDeclaration(
  assignments: Map<string, ApiDefinition>,
  name: string,
  file: string,
) {
  return !assignments.has(name) || file.includes('/initialize-')
}
