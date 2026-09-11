import assert from 'node:assert/strict'

export type MeasuredFile = { name: string; durationMs: number; tests: number }

export function readCompletedFiles(report: unknown): MeasuredFile[] {
  assert.ok(typeof report === 'object' && report !== null)
  const data = report as Record<string, unknown>
  assert.equal(
    data['success'],
    true,
    'Resolve failing or incomplete runs before planning shards.',
  )
  assert.ok(
    Array.isArray(data['testResults']) && data['testResults'].length > 0,
  )
  const files = data['testResults'].map(readMeasuredFile)
  assert.equal(
    new Set(files.map(file => file.name)).size,
    files.length,
    'Duplicate file identities require separate reports per test project.',
  )
  const tests = files.reduce((total, file) => total + file.tests, 0)
  assert.equal(
    tests,
    data['numTotalTests'],
    'The report must account for every test.',
  )
  assert.equal(
    tests,
    data['numPassedTests'],
    'Skipped or missing tests cannot establish the support inventory.',
  )
  return files
}

export function readMeasuredFile(value: unknown): MeasuredFile {
  assert.ok(typeof value === 'object' && value !== null)
  const file = value as Record<string, unknown>
  assert.ok(typeof file['name'] === 'string' && file['name'].length > 0)
  assert.equal(file['status'], 'passed')
  const start = file['startTime']
  const end = file['endTime']
  assert.ok(typeof start === 'number' && Number.isFinite(start))
  assert.ok(typeof end === 'number' && Number.isFinite(end) && end >= start)
  assert.ok(Array.isArray(file['assertionResults']))
  for (const result of file['assertionResults']) {
    assert.equal(result.status, 'passed')
  }
  return {
    name: file['name'],
    durationMs: end - start,
    tests: file['assertionResults'].length,
  }
}
