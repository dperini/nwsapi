const SECURITY_FLOORS = new Map([
  [22, [22, 23, 4]],
  [24, [24, 22, 1]],
  [26, [26, 12, 1]],
])

export function nodeSecurityMinimum(version = '') {
  const major = /^v?(\d+)\./.exec(version)
  const majorVersion = Number(major?.[1])
  const floor = SECURITY_FLOORS.get(majorVersion)
  if (floor) {
    return floor.join('.')
  }
  return majorVersion > 26 ? '26.12.1' : '22.23.4'
}

export function nodeMeetsSecurityFloor(version = '') {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    return false
  }
  const actual = match.slice(1).map(Number)
  const major = actual[0]!
  if (major < 22 || (major > 22 && major < 24) || (major > 24 && major < 26)) {
    return false
  }
  const minimum = nodeSecurityMinimum(version).split('.').map(Number)
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) {
      return actual[index]! > minimum[index]!
    }
  }
  return true
}

export function bootstrapNodeIssue(version = process.versions.node) {
  if (nodeMeetsSecurityFloor(version)) {
    return undefined
  }
  return `Node.js 22.23.4, 24.22.1, or 26.12.1 (or a later supported release) is required for setup; got ${version}.`
}
