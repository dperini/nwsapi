import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { minify } from 'terser';

const pkg = JSON.parse(await readFile('./package.json', 'utf8'));
const source = await readFile('./src/nwsapi.js', 'utf8');

const year = new Date().getFullYear();
const banner = [
  '/*!',
  ` * NWSAPI ${pkg.version} - ${pkg.description}`,
  ` * Copyright (c) 2007-${year} Diego Perini`,
  ' * See https://github.com/dperini/nwsapi',
  ' */',
].join('\n');

const result = await minify(source, {
  compress: true,
  mangle: true,
  format: {
    comments: false,
  },
});

if (!result.code) {
  throw new Error('terser produced no output');
}

await mkdir('./dist', { recursive: true });
await writeFile('./dist/nwsapi.min.js', `${banner}\n${result.code}\n`, 'utf8');

console.log('wrote ./dist/nwsapi.min.js');
