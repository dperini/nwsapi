// Authoring paths, local outputs, and published paths have one shared mapping.
export const entries = [
  {
    source: 'bin/nwsapi.mts',
    output: 'dist/bin/nwsapi.js',
    published: 'bin/nwsapi.js',
  },
  {
    source: 'src/nwsapi.mts',
    output: 'dist/nwsapi.js',
    published: 'src/nwsapi.js',
  },
  {
    source: 'src/modules/nwsapi-legacy.mts',
    output: 'dist/modules/nwsapi-legacy.js',
    published: 'src/modules/nwsapi-legacy.js',
  },
  {
    source: 'src/dom-selector.mts',
    output: 'dist/dom-selector.js',
    published: 'src/dom-selector.js',
  },
  {
    source: 'src/modules/nwsapi-jquery.mts',
    output: 'dist/modules/nwsapi-jquery.js',
    published: 'src/modules/nwsapi-jquery.js',
  },
  {
    source: 'src/modules/nwsapi-traversal.mts',
    output: 'dist/modules/nwsapi-traversal.js',
    published: 'src/modules/nwsapi-traversal.js',
  },
] as const

export const externalEntries = ['unicode'] as const

export const packageFiles = [
  ...entries.map(({ output, published }) => ({ output, published })),
  { output: 'dist/cli.js', published: 'dist/cli.js' },
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
]
