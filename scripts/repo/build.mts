import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { minify, transform } from 'rolldown/utils'
import { entries } from '../../.config/build.config.mts'

const pkg = JSON.parse(await readFile('./package.json', 'utf8'))
// Transform each file as a script so its UMD, CommonJS, or global registration
// stays intact. Do not bundle the lazy css-tree peer or change module wrappers.
for (const entry of entries) {
  const source = await readFile(`${entry}.mts`, 'utf8')
  const result = await transform(`${entry}.mts`, source, {
    lang: 'ts',
    sourceType: 'script',
  })
  if (result.errors.length) {
    throw new Error(result.errors.map(error => error.message).join('\n'))
  }
  await writeFile(`${entry}.js`, result.code, 'utf8')
}
const source = await readFile('./src/nwsapi.js', 'utf8')

const year = new Date().getFullYear()
const banner = [
  '/*!',
  ` * NWSAPI ${pkg.version} - ${pkg.description}`,
  ` * Copyright (c) 2007-${year} Diego Perini`,
  ' * See https://github.com/dperini/nwsapi',
  ' */',
].join('\n')

const result = await minify('nwsapi.js', source, {
  // Keep the existing browser syntax floor when compressing the UMD source.
  compress: { target: 'es2015' },
  mangle: true,
  codegen: { legalComments: 'none' },
})

if (result.errors.length) {
  throw new Error(result.errors.map(error => error.message).join('\n'))
}
if (!result.code) {
  throw new Error('Rolldown produced no output')
}

await mkdir('./dist', { recursive: true })
await writeFile('./dist/nwsapi.min.js', `${banner}\n${result.code}\n`, 'utf8')

console.error('Built published JavaScript files')
