// Published paths are stable even though their sources are TypeScript.
export const entries = [
  'src/nwsapi',
  'src/dom-selector',
  'src/modules/nwsapi-jquery',
  'src/modules/nwsapi-traversal',
] as const

export const outputs = [
  ...entries.map(entry => `${entry}.js`),
  'dist/nwsapi.min.js',
]
