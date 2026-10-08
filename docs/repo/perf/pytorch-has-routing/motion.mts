import { motionFrame, motionPoint } from './motion-frame.mts'
import type { SearchRoute, ToyNode } from './dom.mts'
import { resultNames, routeDirections } from './dom.mts'
import { element, input, text } from './ui.mts'
import { syncRangePulse } from './range.mts'

const routes: SearchRoute[] = ['forward', 'inverse']
let nodes: ToyNode[] = []
let beat = 0
let total = 0
let timer: ReturnType<typeof setInterval> | undefined
let activeRoute: SearchRoute | undefined
const positions: Record<SearchRoute, number> = { forward: 0, inverse: 0 }
const reduced = matchMedia('(prefers-reduced-motion: reduce)')

function status(state: string, message: string) {
  element('film-status').dataset['playback'] = state
  text('film-status', message)
}

function graphic(route: SearchRoute) {
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
    const width = point.label.length * 7 + 16
    const shape =
      point.label.length > 3
        ? `<rect x="${-width / 2}" y="-13" width="${width}" height="26" rx="7"/>`
        : `<circle r="${point.label === 'DOM' ? 18 : 13}"/>`
    return `<g data-motion-node="${node.id}" class="film-node film-${node.kind}" transform="translate(${point.x} ${point.y})">${shape}<text y="4" text-anchor="middle">${point.label}</text></g>`
  })
  return `<svg viewBox="0 0 440 310" aria-hidden="true"><g class="film-links">${links.join('')}</g>${dots.join('')}<circle class="film-cursor" r="18" visibility="hidden"/></svg><button type="button" class="film-scene-control" data-film-route="${route}" aria-pressed="false" aria-label="Play ${routeDirections[route]}ward search. Drag or use arrow keys to step. Home rewinds, End finishes."><span class="film-scene-action" data-film-label>Play</span></button>`
}

function labelScene(control: HTMLElement, playing: boolean) {
  const label = control.querySelector('[data-film-label]')
  if (!label) {
    return
  }
  const action = playing ? 'Pause' : 'Play'
  label.textContent = action
  control.setAttribute(
    'aria-label',
    `${action} ${routeDirections[control.dataset['filmRoute'] as SearchRoute]}ward search. Drag or use arrow keys to step. Home rewinds, End finishes.`,
  )
}

function stop() {
  clearInterval(timer)
  timer = undefined
  activeRoute = undefined
  document
    .querySelectorAll<HTMLElement>('[data-film-route]')
    .forEach(control => {
      control.setAttribute('aria-pressed', 'false')
      labelScene(control, false)
    })
  text('film-play', 'Play both routes')
  element('film-play').setAttribute('aria-pressed', 'false')
  status('paused', 'Paused. Use Next step or drag the timeline to continue.')
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
  const frame = motionFrame(nodes, route, positions[route])
  const scene = element(`film-${route}`)
  const dots = scene.querySelectorAll<SVGGElement>('[data-motion-node]')
  for (let i = 0, length = dots.length; i < length; i += 1) {
    const dot = dots[i]!
    const node = nodes.find(item => item.id === dot.dataset['motionNode'])!
    dot.dataset['current'] = String(node.id === frame.current?.current)
    dot.dataset['marked'] = String(
      node.kind === 'card' && frame.marked.has(node.card!),
    )
    dot.dataset['match'] = String(
      node.kind === 'card' && frame.matches.includes(node.card!),
    )
  }
  moveCursor(scene, frame.current?.current)
  const work = `${frame.work} ${frame.work === 1 ? 'operation' : 'operations'}`
  text(`film-${route}-work`, work)
  text(`film-${route}-result`, resultNames(frame.matches))
  text(`film-${route}-summary`, `${work} · ${resultNames(frame.matches)}`)
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
  syncRangePulse(input('film-timeline'))
  text('film-beat', `Illustrated step ${beat} / ${total}`)
  const frames = routes.map(route =>
    motionFrame(nodes, route, positions[route]),
  )
  const bothComplete = frames.every(frame => frame.complete)
  ;(element('film-next') as HTMLButtonElement).disabled = bothComplete
  document
    .querySelector('.film-scoreboard')
    ?.toggleAttribute(
      'data-agree',
      bothComplete && frames[0]!.matches.join() === frames[1]!.matches.join(),
    )
  const completedRoute = activeRoute
  const complete = completedRoute
    ? motionFrame(nodes, completedRoute, positions[completedRoute]).complete
    : bothComplete
  if (complete) {
    stop()
    status(
      'complete',
      completedRoute
        ? `Search ${routeDirections[completedRoute]} complete.`
        : 'Both searches are complete. Their exact matches agree.',
    )
  }
}

export function renderMotion(fixture: ToyNode[]) {
  stop()
  nodes = fixture
  beat = 0
  positions.forward = 0
  positions.inverse = 0
  total = Math.max(...routes.map(route => motionFrame(nodes, route, 0).total))
  for (let i = 0, length = routes.length; i < length; i += 1) {
    element(`film-${routes[i]}`).innerHTML = graphic(routes[i]!)
  }
  input('film-timeline').max = String(total)
  status('ready', 'Ready. Both routes use the same sample DOM.')
  draw()
}

function next() {
  const advancing = activeRoute ? [activeRoute] : routes
  advancing.forEach(route => {
    positions[route] = Math.min(
      motionFrame(nodes, route, 0).total,
      positions[route] + 1,
    )
  })
  beat = Math.max(positions.forward, positions.inverse)
  draw()
}

function play(route?: SearchRoute | undefined) {
  if (timer !== undefined && activeRoute === route) {
    stop()
    return
  }
  stop()
  activeRoute = route
  const advancing = route ? [route] : routes
  advancing.forEach(direction => {
    if (motionFrame(nodes, direction, positions[direction]).complete) {
      positions[direction] = 0
    }
  })
  beat = Math.max(positions.forward, positions.inverse)
  draw()
  document
    .querySelectorAll<HTMLElement>('[data-film-route]')
    .forEach(control => {
      const playing =
        route === undefined || control.dataset['filmRoute'] === route
      control.setAttribute('aria-pressed', String(playing))
      labelScene(control, playing)
    })
  text(
    'film-play',
    route ? `Pause ${routeDirections[route]}ward search` : 'Pause both routes',
  )
  element('film-play').setAttribute('aria-pressed', 'true')
  status(
    'playing',
    route
      ? `Searching ${routeDirections[route]}. Drag to scrub.`
      : 'Playing both routes. Drag either diagram to scrub.',
  )
  timer = setInterval(next, 1200)
}

function bindDrag(route: SearchRoute) {
  const scene = element(`film-${route}`)
  let startX = 0
  let startPosition = 0
  let dragging = false
  let moved = false
  let activatePointer = false
  scene.addEventListener('pointerdown', event => {
    if (event.button !== 0) {
      return
    }
    startX = event.clientX
    startPosition = positions[route]
    dragging = true
    moved = false
    activatePointer = false
    scene.setPointerCapture(event.pointerId)
  })
  scene.addEventListener('pointermove', event => {
    if (!dragging || (!moved && Math.abs(event.clientX - startX) < 5)) {
      return
    }
    moved = true
    stop()
    const steps = Math.round((event.clientX - startX) / 20)
    positions[route] = Math.max(
      0,
      Math.min(motionFrame(nodes, route, 0).total, startPosition + steps),
    )
    beat = Math.max(positions.forward, positions.inverse)
    draw()
    status(
      'paused',
      `Scrubbing ${routeDirections[route]}ward search. Step ${positions[route]}.`,
    )
  })
  scene.addEventListener('pointerup', () => {
    if (!dragging) {
      return
    }
    dragging = false
    activatePointer = !moved
  })
  scene.addEventListener('click', event => {
    if (event.detail === 0 || activatePointer) {
      play(route)
    }
    activatePointer = false
  })
  scene.addEventListener('pointercancel', () => {
    dragging = false
    activatePointer = false
  })
  scene.addEventListener('lostpointercapture', () => {
    if (dragging) {
      activatePointer = false
    }
    dragging = false
  })
  scene.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      play(route)
      return
    }
    const length = motionFrame(nodes, route, 0).total
    const destinations: Record<string, number> = {
      ArrowLeft: positions[route] - 1,
      ArrowRight: positions[route] + 1,
      Home: 0,
      End: length,
    }
    const destination = destinations[event.key]
    if (destination !== undefined) {
      event.preventDefault()
      stop()
      positions[route] = Math.max(0, Math.min(length, destination))
      beat = Math.max(positions.forward, positions.inverse)
      draw()
    }
  })
}

function initializeRouteControls() {
  routes.forEach(bindDrag)
  document
    .querySelectorAll<HTMLButtonElement>('.film-route-toggle')
    .forEach(button => {
      if (button.tagName === 'BUTTON') {
        button.addEventListener('click', () =>
          play(button.dataset['filmRoute'] as SearchRoute),
        )
      }
    })
}

export function initializeMotion() {
  initializeRouteControls()
  element('film-play').addEventListener('click', () => {
    if (timer !== undefined) {
      stop()
    } else {
      play()
    }
  })
  element('film-next').addEventListener('click', () => {
    stop()
    next()
  })
  element('film-reset').addEventListener('click', () => renderMotion(nodes))
  input('film-timeline').addEventListener('input', () => {
    stop()
    beat = Number(input('film-timeline').value)
    positions.forward = beat
    positions.inverse = beat
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
