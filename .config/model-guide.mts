import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const criticalStyles = path.join(
  root,
  'docs/repo/perf/pytorch-has-routing/critical.css',
)

export default defineConfig({
  root: path.join(root, 'docs/repo/perf'),
  plugins: [
    {
      name: 'guide-critical-styles',
      configureServer(server) {
        server.watcher.add(criticalStyles)
        server.watcher.on('change', file => {
          if (file === criticalStyles) {
            server.ws.send({ type: 'full-reload' })
          }
        })
      },
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const css = readFileSync(criticalStyles, 'utf8')
          return html.replace(
            '</head>',
            `<style data-guide-critical>${css}</style>\n</head>`,
          )
        },
      },
    },
  ],
  build: {
    outDir: path.join(root, '.cache/model-guide-build'),
    emptyOutDir: true,
    rolldownOptions: {
      input: [
        path.join(root, 'docs/repo/perf/pytorch-has-routing.html'),
        path.join(root, 'docs/repo/perf/model-guide-reading.html'),
      ],
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
