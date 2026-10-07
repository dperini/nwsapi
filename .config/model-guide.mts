import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))

export default defineConfig({
  root: path.join(root, 'docs/repo/perf'),
  build: {
    outDir: path.join(root, '.cache/model-guide-build'),
    emptyOutDir: true,
    rolldownOptions: {
      input: path.join(root, 'docs/repo/perf/pytorch-has-routing.html'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env['PORT'] || 4389),
    strictPort: true,
    allowedHosts: ['nwsapi-model-guide.localhost'],
    fs: { allow: [root] },
  },
})
