export function annotateCommonJsExports(exports: Record<string, unknown>) {
  const properties = Object.keys(exports)
    .toSorted()
    .map(name => `  ${JSON.stringify(name)}: null`)
  return [
    '// Annotate the CommonJS export names for ESM import in Node.js.',
    '0 && (module.exports = {',
    properties.join(',\n'),
    '});',
    '',
  ].join('\n')
}
