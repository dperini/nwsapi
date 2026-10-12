import {
  lstat,
  mkdir,
  opendir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

const MAX_REPORT_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const MAX_REVIEW_DIRS = 4
const MAX_SHARD_DIRS = 32
const MAX_DIRECTORY_ENTRIES = 512
const REPORT_NAME = /^unit-shard-\d+(?:\.vitest)?\.json$/

interface ReviewReportsOptions {
  sandbox: string
  destination: string
  redact: (value: string) => string
  maxReportBytes?: number
  maxTotalBytes?: number
}

interface ReviewReport {
  name: string
  content: string
  bytes: number
  failed: boolean
}

export async function retainFailedReviewReports({
  sandbox,
  destination,
  redact,
  maxReportBytes = MAX_REPORT_BYTES,
  maxTotalBytes = MAX_TOTAL_BYTES,
}: ReviewReportsOptions) {
  const temporaryRoot = path.join(sandbox, 'tmp')
  const reviewDirectories = await matchingDirectories(
    temporaryRoot,
    /^nwsapi-review-unit-/,
  )
  const files: string[] = []
  let totalBytes = 0

  for (const reviewDirectory of reviewDirectories.slice(-MAX_REVIEW_DIRS)) {
    const shardDirectories = await matchingDirectories(
      reviewDirectory,
      /^nwsapi-unit-shard-\d+-/,
    )
    for (const shardDirectory of shardDirectories.slice(0, MAX_SHARD_DIRS)) {
      const reports = await readShardReports(
        shardDirectory,
        redact,
        maxReportBytes,
      )
      if (!reports.some(report => report.failed)) {
        continue
      }
      for (const report of reports) {
        if (!report.failed && !report.name.endsWith('.vitest.json')) {
          continue
        }
        if (report.bytes + totalBytes > maxTotalBytes) {
          return files
        }
        const outputDirectory = path.join(
          destination,
          path.basename(reviewDirectory),
          path.basename(shardDirectory),
        )
        await mkdir(outputDirectory, { recursive: true })
        const output = path.join(outputDirectory, report.name)
        await writeFile(output, report.content)
        files.push(output)
        totalBytes += report.bytes
      }
    }
  }
  return files
}

async function matchingDirectories(root: string, pattern: RegExp) {
  let directory
  try {
    directory = await opendir(root)
  } catch {
    return []
  }
  const matches: string[] = []
  let visited = 0
  for await (const entry of directory) {
    visited += 1
    if (entry.isDirectory() && pattern.test(entry.name)) {
      matches.push(path.join(root, entry.name))
    }
    if (visited >= MAX_DIRECTORY_ENTRIES) {
      break
    }
  }
  return matches.toSorted()
}

async function readShardReports(
  directory: string,
  redact: (value: string) => string,
  maxBytes: number,
) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const reports: ReviewReport[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !REPORT_NAME.test(entry.name)) {
      continue
    }
    const report = await readReport(
      path.join(directory, entry.name),
      entry.name,
      redact,
      maxBytes,
    )
    if (report) {
      reports.push(report)
    }
  }
  const failed = reports.some(report => report.failed)
  return reports.map(report => ({ ...report, failed: failed || report.failed }))
}

async function readReport(
  file: string,
  name: string,
  redact: (value: string) => string,
  maxBytes: number,
): Promise<ReviewReport | undefined> {
  try {
    const metadata = await lstat(file)
    if (!metadata.isFile() || metadata.size > maxBytes) {
      return undefined
    }
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!isRecord(parsed)) {
      return undefined
    }
    const cleaned = redactValue(parsed, redact)
    const content = `${JSON.stringify(cleaned, null, 2)}\n`
    const bytes = Buffer.byteLength(content)
    if (bytes > maxBytes) {
      return undefined
    }
    return {
      name,
      content,
      bytes,
      failed: hasFailedTests(parsed),
    }
  } catch {
    return undefined
  }
}

function hasFailedTests(value: Record<string, unknown>) {
  const report = isRecord(value['report']) ? value['report'] : value
  const rejectedCounts = [
    report['numFailedTestSuites'],
    report['numFailedTests'],
    report['numPendingTestSuites'],
    report['numPendingTests'],
    report['numTodoTests'],
  ]
  if (
    value['exitCode'] !== undefined &&
    typeof value['exitCode'] === 'number' &&
    value['exitCode'] !== 0
  ) {
    return true
  }
  if (
    report['success'] === false ||
    rejectedCounts.some(count => typeof count === 'number' && count > 0)
  ) {
    return true
  }
  const results = report['testResults']
  return (
    Array.isArray(results) &&
    results.some(suite => isRecord(suite) && suite['status'] !== 'passed')
  )
}

function redactValue(
  value: unknown,
  redact: (value: string) => string,
): unknown {
  if (typeof value === 'string') {
    return redact(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, redact))
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redact(key),
        redactValue(item, redact),
      ]),
    )
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
