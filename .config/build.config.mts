// Published paths are stable even though their sources are TypeScript.
export const entries = [
  'bin/nwsapi',
  'src/nwsapi',
  'src/dom-selector',
  'src/modules/nwsapi-jquery',
  'src/modules/nwsapi-traversal',
] as const

export const externalEntries = ['unicode'] as const

export const outputs = [
  ...entries.map(entry => `${entry}.js`),
  'dist/nwsapi.min.js',
  'dist/cli.js',
  ...externalEntries.flatMap(name => [
    `dist/external/${name}.js`,
    `dist/external/${name}.d.ts`,
  ]),
]
