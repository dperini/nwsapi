import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { optimiseSvg } from '../scripts/repo/gen/svg-optimize.mts'
import {
  READING_MODE_KEY,
  COLOR_MODE_KEY,
} from '../docs/repo/perf/pytorch-has-routing/reading-mode.mts'

const root = fileURLToPath(new URL('../', import.meta.url))
const criticalStyles = path.join(
  root,
  'docs/repo/perf/pytorch-has-routing/critical.css',
)
const languageIcon = path.join(
  root,
  'assets/repo/model-guide/icons/language.svg',
)
const readingIcon = path.join(root, 'assets/repo/model-guide/icons/reading.svg')
const colorIcon = path.join(
  root,
  'assets/repo/model-guide/icons/color-mode.svg',
)

export default defineConfig({
  root: path.join(root, 'docs/repo/perf'),
  plugins: [
    {
      name: 'guide-head-and-icons',
      configureServer(server) {
        server.watcher.add([
          criticalStyles,
          languageIcon,
          readingIcon,
          colorIcon,
        ])
        server.watcher.on('change', file => {
          if (
            [criticalStyles, languageIcon, readingIcon, colorIcon].includes(
              file,
            )
          ) {
            server.ws.send({ type: 'full-reload' })
          }
        })
      },
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const css = readFileSync(criticalStyles, 'utf8')
          const icon = optimiseSvg(readFileSync(languageIcon, 'utf8'))
          const book = optimiseSvg(readFileSync(readingIcon, 'utf8'))
          const color = optimiseSvg(readFileSync(colorIcon, 'utf8'))
          const restoreAppearance = `(() => { const root = document.documentElement; let mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; let reading = false; try { const saved = sessionStorage.getItem(${JSON.stringify(COLOR_MODE_KEY)}); if (saved === 'dark' || saved === 'light') { mode = saved; } reading = sessionStorage.getItem(${JSON.stringify(READING_MODE_KEY)}) === 'true' } catch {} root.dataset.colorMode = mode; root.toggleAttribute('data-reading-mode', reading); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', reading ? '#f4ecdf' : mode === 'dark' ? '#0c171e' : '#f5f8fc') })()`
          return html
            .replaceAll('<!-- guide-language-symbol -->', icon)
            .replaceAll('<!-- guide-reading-symbol -->', book)
            .replaceAll('<!-- guide-color-symbol -->', color)
            .replace(
              '</head>',
              `<style data-guide-critical>${css}</style>\n<script>${restoreAppearance}</script>\n</head>`,
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
