export interface ReportIdentity {
  candidateVersion: string
  candidateSha256: string
  competitorVersion: string
  lockfileSha256: string
  runtime?: string
  cpu?: string
  platform?: string
  competitorBundleSha256?: string
}

export function assertReportIdentity(
  reference: ReportIdentity,
  reports: ReportIdentity[],
) {
  for (const report of reports) {
    for (const key of [
      'candidateVersion',
      'candidateSha256',
      'competitorVersion',
      'lockfileSha256',
    ] as const) {
      if (!reference[key] || report[key] !== reference[key]) {
        throw new Error(
          `Benchmark ${key} differs or is missing. Regenerate measurements against the same builds before publishing the summary.`,
        )
      }
    }
    for (const key of ['runtime', 'cpu', 'platform'] as const) {
      if (reference[key] && report[key] && reference[key] !== report[key]) {
        throw new Error(
          `Benchmark ${key} differs. Refresh measurements on the same browser and machine.`,
        )
      }
    }
    if (
      reference.competitorBundleSha256 &&
      report.competitorBundleSha256 &&
      reference.competitorBundleSha256 !== report.competitorBundleSha256
    ) {
      throw new Error(
        'Benchmark competitor bundles differ. Regenerate measurements before publishing the summary.',
      )
    }
  }
}
