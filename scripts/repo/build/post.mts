import { chmod, copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import {
  externalEntries,
  obsoleteOutputs,
} from '../../../.config/build.config.mts'
import { isMainModule } from '../lib/run-node.mts'
import { checkLegacyHooks } from '../check/legacy-hooks.mts'
import { annotateCommonJsExports } from './post/annotate-cjs-exports.mts'

export async function postBuild() {
  const require = createRequire(import.meta.url)
  for (const name of externalEntries) {
    const file = `./dist/external/${name}.js`
    const code = await readFile(file, 'utf8')
    const annotation = annotateCommonJsExports(
      require(`../../../src/external/${name}.js`),
    )
    // Append after tree shaking so Node can read the unreachable export names.
    if (!code.endsWith(annotation)) {
      await writeFile(file, `${code}\n${annotation}`, 'utf8')
    }
    await copyFile(
      `./src/external/${name}.d.ts`,
      `./dist/external/${name}.d.ts`,
    )
  }
  const pkg = JSON.parse(await readFile('./package.json', 'utf8'))
  const source = await readFile('./dist/nwsapi.js', 'utf8')
  const year = new Date().getFullYear()
  const banner = [
    '/*!',
    ` * NWSAPI ${pkg.version} - ${pkg.description}`,
    ` * Copyright (c) 2007-${year} Diego Perini`,
    ' * See https://github.com/dperini/nwsapi',
    ' */',
  ].join('\n')
  if (!source.startsWith(banner + '\n')) {
    await writeFile('./dist/nwsapi.js', `${banner}\n${source}`, 'utf8')
  }
  checkLegacyHooks(
    source,
    await readFile('./dist/modules/nwsapi-legacy.js', 'utf8'),
  )
  await Promise.all(obsoleteOutputs.map(file => rm(file, { force: true })))
  await chmod('./dist/bin/nwsapi.js', 0o755)
}

if (isMainModule(import.meta.url)) {
  await postBuild()
}
