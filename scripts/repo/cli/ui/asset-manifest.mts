export const OPENTUI_VERSION = '0.5.17'

export const sharedAssetKeys = [
  '@opentui/core/assets/javascript/highlights.scm',
  '@opentui/core/assets/javascript/tree-sitter-javascript.wasm',
  '@opentui/core/assets/markdown/highlights.scm',
  '@opentui/core/assets/markdown/injections.scm',
  '@opentui/core/assets/markdown/tree-sitter-markdown.wasm',
  '@opentui/core/assets/markdown_inline/highlights.scm',
  '@opentui/core/assets/markdown_inline/tree-sitter-markdown_inline.wasm',
  '@opentui/core/assets/typescript/highlights.scm',
  '@opentui/core/assets/typescript/tree-sitter-typescript.wasm',
  '@opentui/core/assets/zig/highlights.scm',
  '@opentui/core/assets/zig/tree-sitter-zig.wasm',
  '@opentui/core/parser.worker.js',
  'web-tree-sitter/tree-sitter.wasm',
] as const

export const nativeAssetPackages = [
  {
    packageName: '@opentui/core-darwin-arm64',
    fileName: 'libopentui.dylib',
    integrity:
      'sha512-ptobzW+1zM29nHvadwy+8uW9jvV8NJr63vcQXWe2rQNtpwN/6k7lEXWiS5LndeBs9AMV5tTsXMEMhttgts4BDQ==',
  },
  {
    packageName: '@opentui/core-darwin-x64',
    fileName: 'libopentui.dylib',
    integrity:
      'sha512-6yLbnElIZPxhZSrZSyS4mB5+k0YFlpRO0Q8uX4sLFTmvOy8tIeDPFcTGRQqZQ1Rk938tiAhf7iyAX3P1wL4Liw==',
  },
  {
    packageName: '@opentui/core-linux-arm64-musl',
    fileName: 'libopentui.so',
    integrity:
      'sha512-QMRdDbmR0LwpmX1HXVbN+V3A44/QsbWzMsF3V7cEz7MaDq6RNBs3CUFqfkPorKgPtI75T0AxM7FdJnjt9C4d0Q==',
  },
  {
    packageName: '@opentui/core-linux-arm64',
    fileName: 'libopentui.so',
    integrity:
      'sha512-HO3dYgzQBGJhe58uJauVClIJg3vToYl/LZa7ZzqxQ+3vZ//cxaJ7tgXhHWR2uJE02550yI69e5nqBpSOTT9E8Q==',
  },
  {
    packageName: '@opentui/core-linux-x64-musl',
    fileName: 'libopentui.so',
    integrity:
      'sha512-M2RatQaeET/werHFSH+cg7OkQk/Wn0VoVXZLLEL7DiCDTuhZyMfi3uFDz0+R1IGiiUITqHWpZdZ1LdBY8NCjwQ==',
  },
  {
    packageName: '@opentui/core-linux-x64',
    fileName: 'libopentui.so',
    integrity:
      'sha512-lNmtQlcwsio4IVo2trc0QoMyun31UsN0mzmSc2BtYMOeOC5e0PyWaEAZWJb/g6AinOs9xwJGL02JAN5J3QPWsw==',
  },
  {
    packageName: '@opentui/core-win32-arm64',
    fileName: 'opentui.dll',
    integrity:
      'sha512-MyVVpZ0CyGDQ+g4eM0zURqEd/9jDrBIPcZdLyZOmWbdoVu36PLM9KAkqwl/n5ASn/rOrQd+d14jUAsZJvFTqzw==',
  },
  {
    packageName: '@opentui/core-win32-x64',
    fileName: 'opentui.dll',
    integrity:
      'sha512-etkuzyfclRX9wel4ivCOk90dUdZNtjK7U6vr7ZHmwkZyOik34ec3Gse0B/jyk192Xdx0l50Tl2xgC1h68XRiEQ==',
  },
] as const

export const nativeNoticeNames = [
  'AUTHORS-LIBWEBP',
  'LICENSE',
  'LICENSE-GHOSTTY',
  'LICENSE-LCMS2',
  'LICENSE-LIBWEBP',
  'LICENSE-STB',
  'LICENSE-WUFFS',
  'PATENTS-LIBWEBP',
] as const

export const sharedNoticePackages = [
  { packageName: '@opentui/core', license: 'LICENSE' },
  { packageName: 'bun-ffi-structs', license: 'LICENSE' },
  { packageName: 'diff', license: 'LICENSE' },
  { packageName: 'marked', license: 'LICENSE.md' },
  { packageName: 'string-width', license: 'license' },
  { packageName: 'emoji-regex', license: 'LICENSE-MIT.txt' },
  { packageName: 'get-east-asian-width', license: 'license' },
  { packageName: 'strip-ansi', license: 'license' },
  { packageName: 'ansi-regex', license: 'license' },
  { packageName: 'web-tree-sitter', license: 'LICENSE' },
  { packageName: 'yaml', license: 'LICENSE' },
] as const

export const sharedNoticeFiles = sharedNoticePackages.map(
  ({ packageName, license }) =>
    `dist/bin/assets/notices/${packageName}/${license}`,
)

export const assetFiles = [
  ...sharedAssetKeys.map(assetFile),
  ...nativeAssetPackages.flatMap(({ packageName, fileName }) => [
    assetFile(nativeAssetKey(packageName, fileName)),
    ...nativeNoticeNames.map(name => noticeFile(packageName, name)),
  ]),
  ...sharedNoticeFiles.map(output => ({
    output,
    published: output.replace(/^dist\//, ''),
  })),
  {
    output: 'dist/bin/assets/package.json',
    published: 'bin/assets/package.json',
  },
]

export function nativeAssetKey(packageName: string, fileName: string) {
  return `${packageName}/${fileName}`
}

export function assetFile(key: string) {
  const output = `dist/bin/assets/${key}`
  return { output, published: output.replace(/^dist\//, '') }
}

export function noticeFile(packageName: string, name: string) {
  const output = `dist/bin/assets/notices/${packageName}/${name}`
  return { output, published: output.replace(/^dist\//, '') }
}

export function hostAssetFiles(target: {
  platform: string
  arch: string
  libc?: 'glibc' | 'musl'
}) {
  const suffix = target.libc === 'musl' ? '-musl' : ''
  const packageName = `@opentui/core-${target.platform}-${target.arch}${suffix}`
  const native = nativeAssetPackages.find(
    entry => entry.packageName === packageName,
  )
  if (!native) {
    throw new Error(
      `OpenTUI has no native asset for ${target.platform}-${target.arch}${suffix}.`,
    )
  }
  return [
    ...sharedAssetKeys.map(assetFile),
    assetFile(nativeAssetKey(native.packageName, native.fileName)),
    ...nativeNoticeNames.map(name => noticeFile(native.packageName, name)),
    ...sharedNoticeFiles.map(output => ({
      output,
      published: output.replace(/^dist\//, ''),
    })),
    {
      output: 'dist/bin/assets/package.json',
      published: 'bin/assets/package.json',
    },
  ]
}

export function packageTarballUrl(packageName: string) {
  const name = packageName.slice('@opentui/'.length)
  return `https://registry.npmjs.org/${packageName}/-/${name}-${OPENTUI_VERSION}.tgz`
}
