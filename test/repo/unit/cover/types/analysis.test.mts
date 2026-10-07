import { beforeEach, expect, test, vi } from 'vitest'

interface FixtureType {
  flags: number
  isErrorType: () => boolean
}
interface FixtureNode {
  kind: number
  parent?: FixtureNode | undefined
  name?: FixtureNode | undefined
  propertyName?: FixtureNode | undefined
  getText: () => string
  getStart: () => number
  getSourceFile: () => { fileName: string }
  forEachChild: (visit: (node: FixtureNode) => void) => void
}
const state = vi.hoisted(() => ({
  nodes: [] as FixtureNode[],
  types: [] as Array<FixtureType | undefined>,
  contextual: undefined as FixtureType | undefined,
  resolved: undefined as FixtureType | undefined,
  symbol: undefined as { flags: number } | undefined,
  project: true,
  missing: false,
  declaration: false,
  external: false,
  leading: '',
  emptyStatements: false,
  diagnostics: [] as Array<{
    category: number
    fileName?: string
    pos: number
    code: number
    text: string
  }>,
  scan: [9, 10],
  dispose: vi.fn(),
  close: vi.fn(),
}))
vi.mock('@maschwenk/tsrs/unstable/ast/scanner', () => ({
  createScanner: () => {
    let index = 0
    return { scan: () => state.scan[index++] }
  },
}))
vi.mock('@maschwenk/tsrs/unstable/ast', () => ({
  SyntaxKind: {
    ThisKeyword: 3,
    ImportAttribute: 11,
    LabeledStatement: 12,
    BreakStatement: 13,
    ContinueStatement: 14,
    DeclareKeyword: 9,
    GlobalKeyword: 10,
  },
  isIdentifier: (node: FixtureNode) => node.kind === 1,
  isPrivateIdentifier: (node: FixtureNode) => node.kind === 2,
  isTypeReferenceNode: (node: FixtureNode | undefined) => node?.kind === 4,
  isQualifiedName: (node: FixtureNode | undefined) => node?.kind === 5,
  isBindingElement: (node: FixtureNode | undefined) => node?.kind === 6,
  isNamedTupleMember: (node: FixtureNode | undefined) => node?.kind === 7,
  isModuleDeclaration: (node: FixtureNode | undefined) => node?.kind === 8,
}))
vi.mock('@maschwenk/tsrs/unstable/sync', () => ({
  DiagnosticCategory: { Error: 1 },
  SymbolFlags: { Alias: 1, Type: 2 },
  TypeFlags: { Any: 1 },
  API: class {
    close = state.close
    createSnapshot() {
      const source = {
        kind: 0,
        fileName: 'fixture.mts',
        isDeclarationFile: state.declaration,
        statements: state.emptyStatements
          ? []
          : [{ getStart: () => state.leading.length }],
        getFullText: () => state.leading,
        forEachChild: (visit: (node: FixtureNode) => void) =>
          state.nodes.forEach(visit),
      }
      const program = {
        getConfigFileParsingDiagnostics: () => state.diagnostics,
        getProgramDiagnostics: () => [],
        getGlobalDiagnostics: () => [],
        getSyntacticDiagnostics: () => [],
        getSemanticDiagnostics: () => [],
        getSourceFileNames: () => ['fixture.mts'],
        getSourceFile: () => (state.missing ? undefined : source),
        isSourceFileFromExternalLibrary: () => state.external,
      }
      const checker = {
        getTypeAtLocation: (node: FixtureNode | FixtureNode[]) =>
          Array.isArray(node) ? state.types : state.resolved,
        getContextualType: () => state.contextual,
        getTypeFromTypeNode: () => state.resolved,
        getSymbolAtLocation: () => state.symbol,
        getAliasedSymbol: () => ({ flags: 2 }),
        getDeclaredTypeOfSymbol: () => state.resolved,
        getTypeOfSymbolAtLocation: () => state.resolved,
      }
      return {
        dispose: state.dispose,
        getConfiguredProject: () =>
          state.project ? { program, checker } : undefined,
      }
    }
  },
}))
import { measureNativeTypeCoverage } from '../../../../../scripts/repo/cover/types/analysis.mts'
function type(flags = 0, error = false): FixtureType {
  return { flags, isErrorType: () => error }
}
function makeNode(text = 'value', kind = 1, parent?: FixtureNode): FixtureNode {
  return {
    kind,
    parent,
    getText: () => text,
    getStart: () => 5,
    getSourceFile: () => ({ fileName: 'fixture.mts' }),
    forEachChild: () => {},
  }
}
beforeEach(() => {
  state.nodes = [makeNode()]
  state.types = [type()]
  state.contextual = undefined
  state.resolved = type()
  state.symbol = undefined
  state.project = true
  state.missing = false
  state.declaration = false
  state.external = false
  state.leading = ''
  state.emptyStatements = false
  state.diagnostics = []
  state.scan = [9, 10]
  state.dispose.mockClear()
  state.close.mockClear()
})
test('typed identifiers yield complete coverage and dispose all compiler resources', () => {
  expect(measureNativeTypeCoverage('/config.json')).toMatchObject({
    covered: 1,
    total: 1,
    pct: 100,
    files: 1,
    engine: 'tsrs',
  })
  expect(state.dispose).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
})
test.each([
  'project',
  'source',
  'diagnostic',
  'empty',
  'declaration',
  'external',
  'generated',
])('invalid or empty projects reject case %s and dispose resources', kind => {
  if (kind === 'project') {
    state.project = false
  }
  if (kind === 'source') {
    state.missing = true
  }
  if (kind === 'diagnostic') {
    state.diagnostics = [{ category: 1, pos: 2, code: 1, text: 'failed' }]
  }
  if (kind === 'empty') {
    state.nodes = []
    state.types = []
    state.emptyStatements = true
  }
  if (kind === 'declaration') {
    state.declaration = true
  }
  if (kind === 'external') {
    state.external = true
  }
  if (kind === 'generated') {
    state.leading = '// @generated\n'
  }
  expect(() => measureNativeTypeCoverage('/config.json')).toThrow()
  expect(state.dispose).toHaveBeenCalledOnce()
  expect(state.close).toHaveBeenCalledOnce()
})
test('diagnostics preserve explicit source identities and ignore non-errors', () => {
  state.diagnostics = [{ category: 2, pos: 0, code: 1, text: 'warning' }]
  expect(measureNativeTypeCoverage('/config.json').pct).toBe(100)
  state.diagnostics = [
    { category: 1, fileName: 'source.mts', pos: 1, code: 2, text: 'error' },
  ]
  expect(() => measureNativeTypeCoverage('/config.json')).toThrow()
})
test.each(['missing', 'error', 'any', 'typed'])(
  'contextual type %s determines whether any is uncovered',
  kind => {
    state.types = [type(1)]
    state.contextual =
      kind === 'missing'
        ? undefined
        : kind === 'error'
          ? type(0, true)
          : kind === 'any'
            ? type(1)
            : type()
    const report = vi.fn()
    const metric = measureNativeTypeCoverage('/config.json', report)
    expect(metric.pct).toBe(kind === 'typed' ? 100 : 0)
    expect(report).toHaveBeenCalledTimes(kind === 'typed' ? 0 : 1)
  },
)
test('uncovered identifiers also work without a reporting callback', () => {
  state.types = [type(1)]
  expect(measureNativeTypeCoverage('/config.json').covered).toBe(0)
})
test.each([
  'reference',
  'qualified',
  'binding',
  'alias',
  'declared',
  'symbol',
  'error',
  'absent',
])('missing compiler types resolve through %s metadata', kind => {
  state.types = [undefined]
  if (kind === 'reference') {
    state.nodes = [makeNode('Type', 1, makeNode('', 4))]
  }
  if (kind === 'qualified') {
    state.nodes = [makeNode('Type', 1, makeNode('', 5, makeNode('', 4)))]
  }
  if (kind === 'binding') {
    const value = makeNode('key', 1)
    value.parent = {
      ...makeNode('', 6),
      propertyName: value,
      name: makeNode('value', 1),
    }
    state.nodes = [value]
  }
  if (kind === 'alias') {
    state.symbol = { flags: 1 }
  }
  if (kind === 'declared') {
    state.symbol = { flags: 2 }
  }
  if (kind === 'symbol') {
    state.symbol = { flags: 0 }
  }
  if (kind === 'error') {
    state.types = [type(0, true)]
  }
  if (kind === 'absent') {
    expect(() => measureNativeTypeCoverage('/config.json')).toThrow()
  } else {
    expect(measureNativeTypeCoverage('/config.json').covered).toBe(
      kind === 'error' ? 0 : 1,
    )
  }
})
test('missing resolved metadata and unresolved symbol types fail consistently', () => {
  state.types = [undefined]
  state.nodes = [makeNode('Type', 1, makeNode('', 4))]
  state.resolved = undefined
  expect(() => measureNativeTypeCoverage('/config.json')).toThrow()
  state.nodes = [makeNode()]
  state.symbol = { flags: 0 }
  state.resolved = type(0, true)
  expect(() => measureNativeTypeCoverage('/config.json')).toThrow()
})
test('declaration metadata excludes labels, tuple names and global markers', () => {
  const tuple = makeNode('label', 1)
  tuple.parent = { ...makeNode('', 7), name: tuple }
  const global = makeNode('global', 1)
  global.parent = { ...makeNode('declare global', 8), name: global }
  state.nodes = [
    makeNode('value', 1),
    makeNode('#private', 2),
    makeNode('this', 3),
    tuple,
    global,
    makeNode('label', 1, makeNode('', 12)),
  ]
  state.types = [type(), type(), type()]
  expect(measureNativeTypeCoverage('/config.json').total).toBe(3)
})
test.each([
  [0, 10],
  [9, 0],
])('non-declaration global text is measured %#', (...tokens) => {
  const global = makeNode('global', 1)
  global.parent = { ...makeNode('global', 8), name: global }
  state.nodes = [global]
  state.scan = tokens
  expect(measureNativeTypeCoverage('/config.json').total).toBe(1)
})
