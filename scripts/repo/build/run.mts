import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'
import { transform } from 'rolldown/utils'
import {
  browserOutputs,
  entries,
  externalEntries,
} from '../../../.config/build.config.mts'
import { externalLoaderPlugin } from '../../../.config/repo/rolldown/external-loaders.mts'
import { postBuild } from './post.mts'
import { bundleEngine } from '../rolldown/engine.mts'
import { lowerToEs5 } from './post/es5.mts'
import { checkUnicodeEs5 } from '../check/unicode-es5.mts'

checkUnicodeEs5()

// Preserve the external module paths and declarations in the distribution.
for (const name of externalEntries) {
  await build({
    input: `./src/external/${name}.js`,
    platform: 'neutral',
    plugins: [externalLoaderPlugin()],
    output: {
      file: `./dist/external/${name}.js`,
      format: 'cjs',
    },
  })
}
// Bundle only the direction helpers and their three Unicode bidi classes.
// The IIFE lives inside the UMD wrapper, shared by every engine instance.
const direction = await build({
  input: './src/engine/direction.mts',
  platform: 'browser',
  plugins: [externalLoaderPlugin()],
  write: false,
  output: {
    format: 'iife',
    name: 'unicodeDirection',
    generatedCode: { symbols: false },
  },
})
const directionCode = direction.output[0]
if (!directionCode || directionCode.type !== 'chunk') {
  throw new Error('Rolldown produced no Unicode direction helpers')
}
// Transform each file as a script so its UMD, CommonJS, or global registration
// stays intact. Do not bundle the lazy css-tree peer or change module wrappers.
for (const entry of entries) {
  if (entry.source === 'bin/nwsapi.mts') {
    continue
  }
  let source = await readFile(entry.source, 'utf8')
  if (entry.source === 'src/engine/nwsapi.mts') {
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
  const result = await transform(entry.source, source, {
    lang: 'ts',
    sourceType: 'script',
  })
  if (result.errors.length) {
    throw new Error(result.errors.map(error => error.message).join('\n'))
  }
  await mkdir(path.dirname(entry.output), { recursive: true })
  let code =
    entry.source === 'src/engine/nwsapi.mts'
      ? await bundleEngine(result.code)
      : result.code
  if (browserOutputs.has(entry.output)) {
    code = await lowerToEs5(code)
  }
  await writeFile(entry.output, code, 'utf8')
}
// The CLI shares the published engine and loads it only when inspecting a query.
const enginePath = fileURLToPath(
  new URL('../../../dist/nwsapi.js', import.meta.url),
)
const legacyPath = fileURLToPath(
  new URL('../../../dist/modules/nwsapi-legacy.js', import.meta.url),
)
await build({
  input: './bin/nwsapi.mts',
  platform: 'node',
  external: ['jsdom', 'css-tree', enginePath, legacyPath],
  output: {
    file: './dist/bin/nwsapi.js',
    format: 'cjs',
    paths: {
      [enginePath]: '../nwsapi.js',
      [legacyPath]: '../modules/nwsapi-legacy.js',
    },
  },
})
await postBuild()

console.error('Built JavaScript in dist/')
