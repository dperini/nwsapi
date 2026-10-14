import { nativeAssetPackages } from '../../cli/ui/asset-manifest.mts'

const targetMetadata = [
  {
    target: 'darwin-arm64',
    packageName: '@opentui/core-darwin-arm64',
    triple: 'aarch64-apple-darwin',
    platform: 'Darwin',
    arch: 'Arm64',
    libc: 'Na',
  },
  {
    target: 'darwin-x64',
    packageName: '@opentui/core-darwin-x64',
    triple: 'x86_64-apple-darwin',
    platform: 'Darwin',
    arch: 'X64',
    libc: 'Na',
  },
  {
    target: 'linux-arm64-gnu',
    packageName: '@opentui/core-linux-arm64',
    triple: 'aarch64-unknown-linux-gnu',
    platform: 'Linux',
    arch: 'Arm64',
    libc: 'Glibc',
  },
  {
    target: 'linux-arm64-musl',
    packageName: '@opentui/core-linux-arm64-musl',
    triple: 'aarch64-unknown-linux-musl',
    platform: 'Linux',
    arch: 'Arm64',
    libc: 'Musl',
  },
  {
    target: 'linux-x64-gnu',
    packageName: '@opentui/core-linux-x64',
    triple: 'x86_64-unknown-linux-gnu',
    platform: 'Linux',
    arch: 'X64',
    libc: 'Glibc',
  },
  {
    target: 'linux-x64-musl',
    packageName: '@opentui/core-linux-x64-musl',
    triple: 'x86_64-unknown-linux-musl',
    platform: 'Linux',
    arch: 'X64',
    libc: 'Musl',
  },
  {
    target: 'win32-arm64-msvc',
    packageName: '@opentui/core-win32-arm64',
    triple: 'aarch64-pc-windows-msvc',
    platform: 'Win32',
    arch: 'Arm64',
    libc: 'Na',
  },
  {
    target: 'win32-x64-msvc',
    packageName: '@opentui/core-win32-x64',
    triple: 'x86_64-pc-windows-msvc',
    platform: 'Win32',
    arch: 'X64',
    libc: 'Na',
  },
] as const

export const nativeCarrierMatrix = targetMetadata.map(target => {
  const asset = nativeAssetPackages.find(
    candidate => candidate.packageName === target.packageName,
  )
  if (!asset) {
    throw new Error(`Missing native asset package ${target.packageName}`)
  }
  return {
    ...target,
    package: asset.packageName,
    integrity: asset.integrity,
    library: asset.fileName,
    proof: target.target === 'darwin-arm64' ? 'host-proven' : 'pending',
  }
})

export type NativeCarrierTarget = (typeof nativeCarrierMatrix)[number]

export function nativeTarget(value: string | undefined) {
  const target = nativeCarrierMatrix.find(
    candidate => candidate.target === value,
  )
  if (!target) {
    throw new Error(
      `Unsupported OpenTUI native target: ${value ?? '(missing)'}`,
    )
  }
  return target
}
