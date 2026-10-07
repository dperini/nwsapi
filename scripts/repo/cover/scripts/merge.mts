import type {
  BranchMapping,
  CoverageMap,
  CoverageMapData,
  FunctionMapping,
  Range,
} from 'istanbul-lib-coverage'
import libCoverage from 'istanbul-lib-coverage'
import {
  coverageLocationKey,
  normalizeCoverageLocations,
} from '../../lib/coverage/normalize.mts'

function uniqueEntries<T>(
  entries: Record<string, T>,
  identity: (item: T) => string,
) {
  const unique = new Map<string, T | undefined>()
  const values = Object.values(entries)
  for (let i = 0, length = values.length; i < length; i += 1) {
    const value = values[i]!
    const key = identity(value)
    unique.set(key, unique.has(key) ? undefined : value)
  }
  return unique
}

function alignEntries<T>(
  reference: Record<string, T>,
  incoming: Record<string, T>,
  identity: (item: T) => string,
) {
  const known = uniqueEntries(reference, identity)
  const candidates = uniqueEntries(incoming, identity)
  const keys = Object.keys(incoming)
  for (let i = 0, length = keys.length; i < length; i += 1) {
    const key = keys[i]!
    const signature = identity(incoming[key]!)
    const existing = known.get(signature)
    if (existing !== undefined && candidates.get(signature) !== undefined) {
      incoming[key] = structuredClone(existing)
    }
  }
}

const statementIdentity = (location: Range) =>
  coverageLocationKey(location.start)
const functionIdentity = (fn: FunctionMapping) =>
  coverageLocationKey(fn.loc.start)
const branchIdentity = (branch: BranchMapping) =>
  coverageLocationKey({
    type: branch.type,
    start: branch.loc.start,
    paths: branch.locations.map(location => location.start),
  })

export function mergeScriptCoverage(
  target: CoverageMap,
  incoming: CoverageMapData | CoverageMap,
) {
  const data = normalizeCoverageLocations(
    libCoverage.createCoverageMap(incoming).toJSON(),
  )
  const files = Object.keys(data)
  const present = new Set(target.files())
  for (let i = 0, length = files.length; i < length; i += 1) {
    const file = files[i]!
    if (!present.has(file)) {
      continue
    }
    const reference = target.fileCoverageFor(file)
    const next = data[file]!
    // Source maps can change range endings while preserving execution starts.
    // Align only unique identities so separate executable paths keep their counts.
    alignEntries(reference.statementMap, next.statementMap, statementIdentity)
    alignEntries(reference.fnMap, next.fnMap, functionIdentity)
    alignEntries(reference.branchMap, next.branchMap, branchIdentity)
  }
  target.merge(data)
}
