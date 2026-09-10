import type { FormatConfig } from 'oxfmt'

// Generated files use tabs and wider lines to keep readable output compact.
// Measurements are recorded in assets/repo/bench/build-compression.json.
export const outputFormat = {
  // Compared with two-space indentation at 160 columns, tabs saved 30,271
  // raw bytes (16.5%), 934 gzip bytes (2.5%), and 642 Brotli bytes (2.1%)
  // in the measured core.
  useTabs: true,
  // Two-column tabs saved 1,273 raw, 157 gzip, and 79 Brotli bytes versus four.
  tabWidth: 2,
  // Compared with 120 columns, wider lines saved 2,785 raw, 389 gzip,
  // and 281 Brotli bytes by reducing wrapping and repeated indentation.
  printWidth: 160,
  // Single quotes saved 40 gzip and 42 Brotli bytes versus double quotes.
  // The raw size was unchanged.
  singleQuote: true,
  // Preserving property quotes tied with 'as-needed' in the measured core.
  quoteProps: 'preserve',
  // Omit optional comma bytes and preserve ES5-compatible argument lists.
  trailingComma: 'none',
  // Omitting semicolons saved 1,680 raw, 278 gzip, and 212 Brotli bytes.
  semi: false,
  // Preserve embedded runtime text. This setting has no measured size benefit.
  embeddedLanguageFormatting: 'off',
  // Keep comment text intact. This setting has no measured size benefit.
  jsdoc: false,
  // LF saved 4,056 raw, 234 gzip, and 71 Brotli bytes compared with CRLF.
  endOfLine: 'lf',
} satisfies FormatConfig

// Authoring paths, local outputs, and published paths have one shared mapping.
export const entries = [
  {
    source: 'src/bin/nwsapi.mts',
    output: 'dist/bin/nwsapi.js',
    published: 'bin/nwsapi.js',
  },
  {
    source: 'src/engine/nwsapi.mts',
    output: 'dist/nwsapi.js',
    published: 'src/nwsapi.js',
  },
  {
    source: 'src/extension/nwsapi-legacy.mts',
    output: 'dist/modules/nwsapi-legacy.js',
    published: 'src/modules/nwsapi-legacy.js',
  },
  {
    source: 'src/adapter/dom-selector.mts',
    output: 'dist/adapter/dom-selector.js',
    published: 'src/dom-selector.js',
  },
  {
    source: 'src/extension/nwsapi-jquery.mts',
    output: 'dist/modules/nwsapi-jquery.js',
    published: 'src/modules/nwsapi-jquery.js',
  },
  {
    source: 'src/extension/nwsapi-traversal.mts',
    output: 'dist/modules/nwsapi-traversal.js',
    published: 'src/modules/nwsapi-traversal.js',
  },
] as const

export const browserOutputs = new Set<string>(
  entries
    .filter(
      ({ source }) =>
        source === 'src/engine/nwsapi.mts' ||
        source.startsWith('src/extension/'),
    )
    .map(({ output }) => output),
)

export const externalEntries = ['unicode'] as const

export const packageFiles = [
  ...entries.map(({ output, published }) => ({ output, published })),
  ...externalEntries.flatMap(name => [
    {
      output: `dist/external/${name}.js`,
      published: `dist/external/${name}.js`,
    },
    {
      output: `dist/external/${name}.d.ts`,
      published: `dist/external/${name}.d.ts`,
    },
  ]),
]

export const outputs = packageFiles.map(({ output }) => output)

// These former generated files must never be used as an accidental fallback.
export const obsoleteOutputs = [
  'bin/nwsapi.js',
  'src/nwsapi.js',
  'src/dom-selector.js',
  'src/modules/nwsapi-jquery.js',
  'src/modules/nwsapi-traversal.js',
  'dist/nwsapi.min.js',
  'dist/cli.js',
  'dist/bin/cli.js',
  'dist/dom-selector.js',
]
