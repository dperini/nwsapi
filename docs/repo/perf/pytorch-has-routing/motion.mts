import { motionFrame, motionPoint } from './motion-frame.mts'
import type { SearchRoute, ToyNode } from './dom.mts'
import { resultNames } from './dom.mts'
import { element, input, text } from './ui.mts'

const routes: SearchRoute[] = ['forward', 'inverse']
let nodes: ToyNode[] = []
let beat = 0
let total = 0
let timer: ReturnType<typeof setInterval> | undefined
const reduced = matchMedia('(prefers-reduced-motion: reduce)')

function graphic() {
  const points = new Map(nodes.map(node => [node.id, motionPoint(node)]))
  const links = nodes
    .filter(node => node.parent)
    .map(node => {
      const start = points.get(node.parent!)!
      const end = points.get(node.id)!
      return `<path d="M${start.x},${start.y} L${end.x},${end.y}"/>`
    })
  const dots = nodes.map(node => {
    const point = points.get(node.id)!
    return `<g data-motion-node="${node.id}" class="film-node film-${node.kind}" transform="translate(${point.x} ${point.y})"><circle r="13"/><text y="4" text-anchor="middle">${point.label}</text></g>`
  })
  return `<svg viewBox="0 0 440 310" aria-hidden="true"><g class="film-links">${links.join('')}</g>${dots.join('')}<circle class="film-cursor" r="18" visibility="hidden"/></svg>`
}

function stop() {
  clearInterval(timer)
  timer = undefined
  text('film-play', 'Play both routes')
  element('film-play').setAttribute('aria-pressed', 'false')
}

function moveCursor(scene: HTMLElement, current: string | undefined) {
  const cursor = scene.querySelector<SVGCircleElement>('.film-cursor')!
  const animations = cursor.getAnimations()
  for (let i = 0, length = animations.length; i < length; i += 1) {
    animations[i]!.cancel()
  }
  cursor.setAttribute('visibility', current ? 'visible' : 'hidden')
  if (!current) {
    return
  }
  const point = motionPoint(nodes.find(node => node.id === current)!)
  const before = cursor.style.transform
  const after = `translate(${point.x}px, ${point.y}px)`
  cursor.style.transform = after
  if (before && before !== after && !reduced.matches) {
    cursor.animate([{ transform: before }, { transform: after }], {
      duration: 450,
      easing: 'cubic-bezier(.2,.7,.2,1)',
    })
  }
}

function drawRoute(route: SearchRoute) {
  const frame = motionFrame(nodes, route, beat)
  const scene = element(`film-${route}`)
  const dots = scene.querySelectorAll<SVGGElement>('[data-motion-node]')
  for (let i = 0, length = dots.length; i < length; i += 1) {
    const dot = dots[i]!
    const node = nodes.find(item => item.id === dot.dataset['motionNode'])!
    dot.dataset['current'] = String(node.id === frame.current?.current)
    dot.dataset['marked'] = String(frame.marked.has(node.card!))
    dot.dataset['match'] = String(
      node.kind === 'card' && frame.matches.includes(node.card!),
    )
  }
  moveCursor(scene, frame.current?.current)
  text(`film-${route}-work`, `${frame.work} operations`)
  text(`film-${route}-result`, resultNames(frame.matches))
  text(
    `film-${route}-caption`,
    frame.complete
      ? `Finished. ${frame.visits} visits + ${frame.ascents} ancestor steps.`
      : frame.current?.description || 'Ready. No nodes examined yet.',
  )
  scene.dataset['complete'] = String(frame.complete)
}

function draw() {
  for (let i = 0, length = routes.length; i < length; i += 1) {
    drawRoute(routes[i]!)
  }
  input('film-timeline').value = String(beat)
  text('film-beat', `Illustrated step ${beat} / ${total}`)
  ;(element('film-next') as HTMLButtonElement).disabled = beat === total
  if (beat === total) {
    stop()
    text(
      'film-status',
      'Both searches are complete. Their exact matches agree.',
    )
  }
}

export function renderMotion(fixture: ToyNode[]) {
  stop()
  nodes = fixture
  beat = 0
  total = Math.max(...routes.map(route => motionFrame(nodes, route, 0).total))
  for (let i = 0, length = routes.length; i < length; i += 1) {
    element(`film-${routes[i]}`).innerHTML = graphic()
  }
  input('film-timeline').max = String(total)
  text('film-status', 'Ready. Both routes use the editable DOM above.')
  draw()
}

function next() {
  beat = Math.min(total, beat + 1)
  draw()
}

function play() {
  if (timer !== undefined) {
    stop()
    return
  }
  if (beat === total) {
    beat = 0
    draw()
  }
  text('film-play', 'Pause both routes')
  element('film-play').setAttribute('aria-pressed', 'true')
  text('film-status', 'Playing. Pause or scrub the timeline at any time.')
  timer = setInterval(next, 1200)
}

export function initializeMotion() {
  element('film-play').addEventListener('click', play)
  element('film-next').addEventListener('click', () => {
    stop()
    next()
  })
  element('film-reset').addEventListener('click', () => renderMotion(nodes))
  input('film-timeline').addEventListener('input', () => {
    stop()
    beat = Number(input('film-timeline').value)
    draw()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop()
    }
  })
  reduced.addEventListener('change', () => {
    stop()
    draw()
  })
}
