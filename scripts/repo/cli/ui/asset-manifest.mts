export const OPENTUI_VERSION = '0.6.6'

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
      'sha512-pETue+Rm0lVUzJQfdd4ra0zqdqtzObxC4aBsPsRnAg/wc8RCSisT7oxudZyGaTq39Lashnp5R6i7QWPK4HvxLQ==',
  },
  {
    packageName: '@opentui/core-darwin-x64',
    fileName: 'libopentui.dylib',
    integrity:
      'sha512-nexiM1l4rrUEz68t9XgdpaU5RcBH2ebHCsxw9UAGHBSlE477x6vjlaO8bvfdvx1k8vBbGir8y8zDWgkraE0cdA==',
  },
  {
    packageName: '@opentui/core-linux-arm64-musl',
    fileName: 'libopentui.so',
    integrity:
      'sha512-FU10EOCQT0+B6JU6oo/RmFCZqKJ2XNB8diLXCsAJzspMrtRngXV84MfyOiNcR6o033O7SdHdep+6PoXfU6RZQw==',
  },
  {
    packageName: '@opentui/core-linux-arm64',
    fileName: 'libopentui.so',
    integrity:
      'sha512-EXKW3Rmhnv3zkca2sqNBmVXm43TWCHqC/UI4fSDml9WfjZcvdbw+mJ8TEBMe818hwkLOn16bJ/behb3GIVZiZQ==',
  },
  {
    packageName: '@opentui/core-linux-x64-musl',
    fileName: 'libopentui.so',
    integrity:
      'sha512-NtRUvk2j7O88JYdVy6aIZyEN31wuHg2cDTsQ13UAoXaGkTc/o3cz8Z7Z1PAA8y5lduZkHWmUd9jhItsfWU8uQw==',
  },
  {
    packageName: '@opentui/core-linux-x64',
    fileName: 'libopentui.so',
    integrity:
      'sha512-MNAAsU2+ywpYfJkZ+EYr02nh0yc9egBWRCFAcKvZiYiCbxCoSTmO1c03LbUMlZ/zUlYOi5ZtwzSNi6rhrQZNkw==',
  },
  {
    packageName: '@opentui/core-win32-arm64',
    fileName: 'opentui.dll',
    integrity:
      'sha512-Z4bJDA04uCDvXFCquDnbCihof5hMVDP7cGBME4fv/zrKuVMQlQlLGwyExQiG+8vmSZeSeNU0ks+p1g3ewL+3ew==',
  },
  {
    packageName: '@opentui/core-win32-x64',
    fileName: 'opentui.dll',
    integrity:
      'sha512-i3IMd1uviUlJICRjzxPf8LJaxQXkZGHHm/ExqWkymvbUI+FjP/2XWC/JMqO7pD39GIb+lkv5Wte3bxQGvXx8Hg==',
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
