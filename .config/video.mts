import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const preview = process.env['PORTLESS_URL']

export default defineConfig({
  root: path.join(root, 'docs/repo/development'),
  publicDir: path.join(root, 'assets/repo/video'),
  appType: 'mpa',
  server: {
    host: '127.0.0.1',
    port: Number(process.env['PORT'] || 4390),
    strictPort: true,
    allowedHosts: ['nwsapi-video.localhost'],
    open: preview ? `${preview}/video.html` : '/video.html',
  },
})
