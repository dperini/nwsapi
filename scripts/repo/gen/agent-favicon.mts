import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { optimiseSvg } from './svg-optimize.mts'

export const NWBOX_COLORS = Object.freeze({
  yellow: '#ffe600',
  orange: '#ff9500',
  gold: '#ffd000',
  black: '#101010',
})
export type FaviconColors = { [Key in keyof typeof NWBOX_COLORS]: string }

export const FRONT_MASK_OUTLINE =
  'M15.8 14.86c-.54.1-1.82.21-3.4-.21s-2.64-1.17-3.05-1.52c-.6-.49-.85-.83-1.1-.31q-.36.68-.8 2.24c-.6 2.26-1.06 7.03 2.68 8.03s5.74-3.35 6.34-5.6q.4-1.58.44-2.35c.03-.58-.36-.41-1.12-.28'

export const PLAYWRIGHT_MASKS = [
  'M8.07 20.57v-.96l-2.68.76s.2-1.15 1.6-1.55q.63-.17 1.08-.06v-3.94H9.4a8 8 0 0 0-.4-1.04c-.2-.4-.4-.14-.85.25-.32.26-1.13.84-2.36 1.17-1.22.32-2.2.24-2.62.17-.58-.1-.89-.23-.86.21q.03.6.34 1.8c.46 1.74 1.99 5.09 4.87 4.3.76-.2 1.3-.6 1.66-1.1zm-4.32-3.16 2.06-.54s-.06.78-.83.99-1.23-.45-1.23-.45',
  `${FRONT_MASK_OUTLINE}m-7.52 1.87s.6-.92 1.6-.63c1 .28 1.07 1.39 1.07 1.39zm2.44 4.12c-1.76-.52-2.03-1.92-2.03-1.92l4.73 1.32s-.95 1.1-2.7.6m1.67-2.89s.6-.91 1.6-.63 1.07 1.4 1.07 1.4z`,
]

export function renderAgentFavicon(colors: FaviconColors = NWBOX_COLORS) {
  if (Object.values(colors).some(color => !/^#[a-f0-9]{6}$/i.test(color))) {
    throw new Error('Favicon colors must be six-digit hexadecimal colors.')
  }
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-label="NWBOX AI agent browser"><defs><linearGradient id="a" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${colors.yellow}"/><stop offset=".52" stop-color="${colors.orange}"/><stop offset="1" stop-color="${colors.gold}"/></linearGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><path fill="#fff" d="M0 0h48v48H0z"/><path fill="#000" stroke="#000" stroke-width="1.3" stroke-linejoin="round" transform="translate(5 -15) scale(2)" d="${FRONT_MASK_OUTLINE}Z"/></mask></defs><path fill="url(#a)" stroke="${colors.black}" stroke-width="2" d="m24 2 22 22-22 22L2 24Z"/>${PLAYWRIGHT_MASKS.map((d, index) => `<g${index === 0 ? ' mask="url(#m)"' : ''}><path transform="translate(5 -15) scale(2)" fill="${colors.black}" stroke="${colors.black}" stroke-width=".2" stroke-linejoin="round" fill-rule="evenodd" d="${d}"/></g>`).join('')}<rect width="46" height="17" x="1" y="31" fill="${colors.black}" rx="3"/><path fill="url(#a)" transform="translate(7.2 20.4) scale(.8)" d="m10 31 5.2-14h4.6L25 31h-4.4l-.8-2.8h-4.6l-.8 2.8Zm6-6h2.9l-1.45-5.1ZM27 17h5v14h-5Z"/></svg>`,
    ) + '\n'
  )
}

export function faviconPreview() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NWBOX · AI favicon</title><link rel="icon" type="image/svg+xml" href="agent-favicon.svg"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#efefef;color:#101010;font:16px system-ui}main{padding:48px;text-align:center}h1{font-size:24px;margin:28px 0 8px}p{color:#555}figure{margin:0}section{display:flex;gap:40px;align-items:center;justify-content:center;padding:28px;background:white;border-radius:12px}figcaption{margin-top:12px;font-size:12px;color:#666}.hero{width:192px;height:192px;margin:0 auto 24px}.colors{display:flex;justify-content:center;gap:12px;margin:28px 0}.colors span{padding:8px 12px;border-radius:5px;font-size:12px;background:var(--color)}</style><main><img class="hero" src="agent-favicon.svg" alt="NWBOX AI favicon"><h1>NWBOX AI browser</h1><p>Yellow → orange → gold</p><div class="colors">${Object.entries(
    NWBOX_COLORS,
  )
    .filter(([name]) => name !== 'black')
    .map(
      ([name, color]) =>
        `<span style="--color:${color}">${({ yellow: 'Yellow', orange: 'Orange', gold: 'Gold' } as Record<string, string>)[name]} ${color}</span>`,
    )
    .join(
      '',
    )}</div><section>${[48, 32, 16].map(size => `<figure><img src="agent-favicon.svg" width="${size}" height="${size}" alt="${size}px favicon"><figcaption>${size}px</figcaption></figure>`).join('')}</section></main></html>\n`
}

export function generateAgentFavicon(
  check = false,
  preview = false,
  root = REPO_ROOT,
) {
  const source = renderAgentFavicon()
  const target = path.join(root, 'assets/repo/agent-favicon.svg')
  if (check) {
    if (readFileSync(target, 'utf8') !== source) {
      throw new Error('Agent favicon is stale. Run pnpm run gen:agent-favicon.')
    }
  } else {
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, source)
  }
  if (preview) {
    const directory = path.join(root, '.cache/favicon-preview')
    mkdirSync(directory, { recursive: true })
    writeFileSync(path.join(directory, 'agent-favicon.svg'), source)
    writeFileSync(path.join(directory, 'index.html'), faviconPreview())
    return directory
  }
  return target
}

export function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: pnpm run gen:agent-favicon [--check] [--preview]')
    return
  }
  if (args.some(arg => !['--check', '--preview'].includes(arg))) {
    throw new Error('Usage: pnpm run gen:agent-favicon [--check] [--preview]')
  }
  console.log(
    generateAgentFavicon(args.includes('--check'), args.includes('--preview')),
  )
}

if (isMainModule(import.meta.url)) {
  main()
}
