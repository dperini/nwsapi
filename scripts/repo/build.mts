import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'rolldown'
import { minify, transform } from 'rolldown/utils'
import { entries, externalEntries } from '../../.config/build.config.mts'

const pkg = JSON.parse(await readFile('./package.json', 'utf8'))
// Preserve the external module paths and declarations in the distribution.
for (const name of externalEntries) {
  await build({
    input: `./src/external/${name}.js`,
    platform: 'neutral',
    output: { file: `./dist/external/${name}.js`, format: 'cjs' },
  })
  await copyFile(`./src/external/${name}.d.ts`, `./dist/external/${name}.d.ts`)
}
// Bundle only the direction helpers and their three Unicode bidi classes.
// The IIFE lives inside the UMD wrapper, shared by every engine instance.
const direction = await build({
  input: './src/internal/direction.mts',
  platform: 'browser',
  write: false,
  output: { format: 'iife', name: 'unicodeDirection' },
})
const directionCode = direction.output[0]
if (!directionCode || directionCode.type !== 'chunk') {
  throw new Error('Rolldown produced no Unicode direction helpers')
}
// Transform each file as a script so its UMD, CommonJS, or global registration
// stays intact. Do not bundle the lazy css-tree peer or change module wrappers.
for (const entry of entries) {
  let source = await readFile(`${entry}.mts`, 'utf8')
  if (entry === 'src/nwsapi') {
    const marker = '/* @bundle:direction */ {}'
    if (!source.includes(marker)) {
      throw new Error('Missing Unicode direction bundle marker')
    }
    source = source.replace(
      marker,
      () =>
        `(function () {\n${directionCode.code}\nreturn unicodeDirection\n})()`,
    )
  }
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

// Keep Node and optional DOM dependencies outside the CommonJS CLI bundle.
await build({
  input: './scripts/repo/cli.mts',
  platform: 'node',
  external: ['jsdom', 'css-tree'],
  output: { file: './dist/cli.js', format: 'cjs' },
})
await chmod('./bin/nwsapi.js', 0o755)

console.error('Built published JavaScript files')
