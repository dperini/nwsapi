import { expect, test } from 'vitest'
import { nativeCarrierMatrix } from '../../../../../scripts/repo/build/native/matrix.mts'

test('native carrier matrix records one proof host without claiming other targets', () => {
  expect(nativeCarrierMatrix).toHaveLength(8)
  expect(
    nativeCarrierMatrix.filter(target => target.proof === 'host-proven'),
  ).toEqual([
    {
      triple: 'darwin-arm64',
      library: 'libopentui.dylib',
      proof: 'host-proven',
    },
  ])
  expect(
    nativeCarrierMatrix.filter(target => target.proof === 'pending'),
  ).toHaveLength(7)
})
