import assert from 'node:assert/strict'

import type { MeasuredFile } from './input.mts'

export type RecoveryShard = {
  index: number
  fileTimeMs: number
  files: MeasuredFile[]
}

export function planRecoveryShards(
  files: MeasuredFile[],
  count: number,
): RecoveryShard[] {
  assert.ok(
    Number.isSafeInteger(count) && count > 0 && count <= files.length,
    'Shard count must be a positive integer no greater than the file count.',
  )
  const shards: RecoveryShard[] = Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    fileTimeMs: 0,
    files: [],
  }))
  const ranked = files.toSorted(
    (a, b) => b.durationMs - a.durationMs || a.name.localeCompare(b.name),
  )
  for (let index = 0, { length } = ranked; index < length; index += 1) {
    const file = ranked[index]!
    const shard = shards.reduce((best, item) =>
      item.fileTimeMs < best.fileTimeMs ? item : best,
    )
    shard.files.push(file)
    shard.fileTimeMs += file.durationMs
  }
  verifyShardInventory(files, shards)
  return shards
}

export function verifyShardInventory(
  files: MeasuredFile[],
  shards: RecoveryShard[],
): void {
  const expected = files.map(file => file.name).toSorted()
  const actual = shards
    .flatMap(shard => shard.files.map(file => file.name))
    .toSorted()
  assert.equal(
    new Set(expected).size,
    expected.length,
    'File identities must be unique.',
  )
  assert.deepEqual(
    actual,
    expected,
    'Every file must appear in exactly one shard.',
  )
}

export function recoveryChecks() {
  return [
    {
      id: 'git-setup',
      action:
        'Count Git subprocess calls in the slowest fixtures. Share unchanged seeds. Omit commits and author configuration only when the test needs the index and files, not history.',
    },
    {
      id: 'repeated-scans',
      action:
        'Count repeated reads, parsing, and directory scans. Compute each unchanged input once within its owning suite. Keep mutable copies private.',
    },
    {
      id: 'imports',
      action:
        'Inspect runner setup, import, and transform timings. Profile costly imports before changing isolation.',
    },
    {
      id: 'shards',
      action:
        'Compare shards on separate CI runners. Preserve the revision, test projects, coverage, private temporary paths, and worker limits. Verify actual merged inventory against the complete baseline.',
    },
    {
      id: 'verify',
      action:
        'Run affected tests with shuffled order, then the original complete lane with its normal deadline. Collect comparable unprofiled runs before claiming budget headroom.',
    },
  ]
}
