import {
  names,
  resultNames,
  searchProgress,
  searchTrace,
  toyNodes,
} from './dom.mts'
import type { SearchRoute, ToyNode } from './dom.mts'
import { element, escapeHtml, input, text } from './ui.mts'
import { initializeMotion, renderMotion } from './motion.mts'

const counts = [1, 0, 1, 0]
let outside = true
let route: SearchRoute = 'forward'
let position = 0
let nodes = toyNodes(counts, outside)
let playing: ReturnType<typeof setInterval> | undefined
let challenge = ''

function nodeMarkup(node: ToyNode): string {
  const children = nodes.filter(child => child.parent === node.id)
  const toggle =
    node.kind === 'card'
      ? `<button type="button" data-warning="${node.card}" aria-label="Change warning count in card ${names[node.card!]}">${counts[node.card!]} ${counts[node.card!] === 1 ? 'warning' : 'warnings'} · change</button>`
      : ''
  return `<div class="tree-node tree-${node.kind}" data-node="${node.id}" data-current="false" data-marked="false" data-match="false"><span class="node-label">${escapeHtml(node.label)}</span>${toggle}${children.length ? `<div class="tree-children">${children.map(nodeMarkup).join('')}</div>` : ''}</div>`
}

function exactMatches() {
  const fixture = document.createElement('main')
  const elements = new Map<string, HTMLElement>([['document', fixture]])
  for (let i = 1, length = nodes.length; i < length; i += 1) {
    const node = nodes[i]!
    const child = document.createElement(
      node.kind === 'card' ? 'article' : 'span',
    )
    child.id = node.id
    child.className = node.kind
    elements.get(node.parent!)!.append(child)
    elements.set(node.id, child)
  }
  return Array.from(fixture.querySelectorAll('.card:has(.warning)')).map(card =>
    names.indexOf(card.id.slice(-1)),
  )
}

function stop() {
  clearInterval(playing)
  playing = undefined
  text('step-play', 'Play')
  element('step-play').setAttribute('aria-pressed', 'false')
}

function comparison() {
  const results = (['forward', 'inverse'] as const).map(direction => {
    const trace = searchTrace(nodes, direction)
    const progress = searchProgress(trace, trace.length)
    text(
      `${direction}-counts`,
      `${progress.visits} candidate/descendant visits + ${progress.ascents} ancestor steps`,
    )
    text(
      `${direction}-matches`,
      progress.matches.length
        ? resultNames(progress.matches)
        : 'No matching cards',
    )
    return progress
  })
  const forwardWork = results[0]!.visits + results[0]!.ascents
  const inverseWork = results[1]!.visits + results[1]!.ascents
  const cheaper = forwardWork <= inverseWork ? 'forward' : 'inverse'
  const extra = Math.abs(forwardWork - inverseWork)
  text(
    'forced-explanation',
    extra === 0
      ? 'Both routes use the same number of counted operations and return the same cards. These counts omit candidate discovery and runtime overhead.'
      : `${cheaper === 'forward' ? 'Forward' : 'Inverse'} uses ${extra} fewer counted operations here. Both routes return the same cards. Counts omit candidate discovery and runtime overhead, so fewer operations do not prove a faster query.`,
  )
}

function showStep() {
  const steps = searchTrace(nodes, route)
  const progress = searchProgress(steps, position)
  document.querySelectorAll<HTMLElement>('[data-node]').forEach(node => {
    const model = nodes.find(item => item.id === node.dataset['node'])!
    node.dataset['current'] = String(model.id === progress.current?.current)
    node.dataset['marked'] = String(
      model.kind === 'card' && progress.marked.has(model.card!),
    )
    node.dataset['match'] = String(
      model.kind === 'card' && progress.matches.includes(model.card!),
    )
  })
  text('step-count', `STEP ${position} OF ${steps.length}`)
  text(
    'trace-description',
    progress.current?.description ||
      'Ready. Choose a route, then press Next step. The result starts empty.',
  )
  text(
    'match-result',
    progress.matches.length || position < steps.length
      ? resultNames(progress.matches)
      : 'No matching cards',
  )
  text(
    'search-work',
    `${progress.visits} visits · ${progress.ascents} ancestor steps`,
  )
  text(
    'search-phase',
    route === 'inverse' &&
      progress.current?.current.startsWith('card-') &&
      progress.current.visit
      ? 'Check marked cards in document order'
      : route === 'forward'
        ? 'Search inside each card'
        : 'Find warnings and mark ancestors',
  )
  text(
    'result-status',
    position === steps.length
      ? 'Complete · both routes agree'
      : 'Building the result',
  )
  ;(element('step-next') as HTMLButtonElement).disabled =
    position >= steps.length
  ;(element('step-back') as HTMLButtonElement).disabled = position === 0
  if (position >= steps.length) {
    stop()
  }
}

function render() {
  stop()
  nodes = toyNodes(counts, outside)
  position = 0
  element('dom-cards').innerHTML = nodeMarkup(nodes[0]!)
  input('outside-warning').checked = outside
  text(
    'route-explanation',
    route === 'forward'
      ? 'Start at a card. Inspect its descendants until the first warning. Then move to the next card.'
      : 'Start at each warning. Mark its ancestors. Then check cards in document order to build the result once per card.',
  )
  const matches = exactMatches()
  const forward = searchTrace(nodes, 'forward')
  const inverse = searchTrace(nodes, 'inverse')
  if (
    JSON.stringify(searchProgress(forward, forward.length).matches) !==
      JSON.stringify(matches) ||
    JSON.stringify(searchProgress(inverse, inverse.length).matches) !==
      JSON.stringify(matches)
  ) {
    throw new Error('Illustrated routes disagree with exact DOM matching')
  }
  comparison()
  showStep()
  renderMotion(nodes)
  document.dispatchEvent(new Event('guide-controls-sync'))
}

function next() {
  const length = searchTrace(nodes, route).length
  position = Math.min(length, position + 1)
  showStep()
}

function play() {
  if (playing !== undefined) {
    stop()
    return
  }
  if (position === searchTrace(nodes, route).length) {
    position = 0
  }
  text('step-play', 'Pause')
  element('step-play').setAttribute('aria-pressed', 'true')
  playing = setInterval(next, 1400)
}

const challenges = {
  outside: {
    counts: [0, 0, 1, 0],
    question: 'Move A’s only warning outside all cards. Which cards match now?',
    explanation:
      'Only C matches. A warning must be inside a card to make that card match.',
  },
  duplicate: {
    counts: [2, 0, 1, 0],
    question: 'Card A has two warnings. Which result list is correct?',
    explanation:
      'A and C each appear once, in document order. Multiple witnesses do not duplicate an anchor.',
  },
  empty: {
    counts: [0, 0, 0, 0],
    question: 'There is one warning outside every card. Does any card match?',
    explanation:
      'No card matches. Finding a warning candidate is not enough. The ancestor relationship still needs to hold.',
  },
}

function selectChallenge(id: keyof typeof challenges) {
  challenge = id
  counts.splice(0, counts.length, ...challenges[id].counts)
  outside = true
  text('challenge-question', challenges[id].question)
  text(
    'challenge-feedback',
    'Choose a result, then reveal the explanation. Step through either route to check it.',
  )
  ;(element('challenge-prediction') as HTMLSelectElement).value = ''
  render()
}

function reveal() {
  if (!challenge) {
    selectChallenge('outside')
    return
  }
  const prediction = (element('challenge-prediction') as HTMLSelectElement)
    .value
  if (!prediction) {
    text('challenge-feedback', 'Choose a prediction first.')
    return
  }
  const answer =
    exactMatches()
      .map(index => names[index])
      .join(',') || 'none'
  text(
    'challenge-feedback',
    `${prediction === answer ? 'Correct.' : 'Not quite.'} ${challenges[challenge as keyof typeof challenges].explanation}`,
  )
}

function growFixture() {
  const fixture = document.createElement('main')
  for (let i = 0, length = 64; i < length; i += 1) {
    const card = document.createElement('article')
    card.className = 'card'
    card.dataset['ok'] = '1'
    if (i % 2 === 0) {
      for (let j = 0, count = 6; j < count; j += 1) {
        const warning = document.createElement('span')
        warning.className = 'warning'
        card.append(warning)
      }
    }
    fixture.append(card)
  }
  const anchors = fixture.querySelectorAll('.card').length
  const witnesses = fixture.querySelectorAll('.warning').length
  const matches = fixture.querySelectorAll(
    '.card[data-ok="1"]:has(.warning)',
  ).length
  input('anchors').value = String(anchors)
  input('witnesses').value = String(witnesses)
  input('anchor-filter').checked = true
  input('witness-filter').checked = false
  input('planner-enabled').checked = true
  element('policy-controls').dispatchEvent(
    new Event('input', { bubbles: true }),
  )
  element('bridge-grid').innerHTML = Array.from(
    { length: anchors },
    (_, i) =>
      `<span class="mini-card" data-match="${i % 2 === 0}" aria-hidden="true">${names[i % 4]}</span>`,
  ).join('')
  text(
    'bridge-result',
    `Counted from a constructed DOM: ${anchors} card candidates, ${witnesses} warning candidates, ${matches} exact matches. Ratio: ${witnesses / anchors}. These counts are now loaded into the saved-policy explorer below.`,
  )
}

function handleClick(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    'button',
  )
  if (!button) {
    return
  }
  const data = button.dataset
  if (data['warning'] !== undefined) {
    const index = Number(data['warning'])
    counts[index] = (counts[index]! + 1) % 3
    challenge = ''
    text(
      'challenge-feedback',
      'DOM changed. Pick a challenge to start a new prediction.',
    )
    render()
  }
  if (data['challenge']) {
    selectChallenge(data['challenge'] as keyof typeof challenges)
  }
  if (data['force']) {
    route = data['force'] as SearchRoute
    input(`route-${route}`).checked = true
    render()
  }
}

export function initializeSearch() {
  initializeMotion()
  render()
  document.addEventListener('click', handleClick)
  element('step-next').addEventListener('click', () => {
    stop()
    next()
  })
  element('step-back').addEventListener('click', () => {
    stop()
    position = Math.max(0, position - 1)
    showStep()
  })
  element('step-reset').addEventListener('click', () => {
    stop()
    position = 0
    showStep()
  })
  element('step-play').addEventListener('click', play)
  document
    .querySelectorAll<HTMLInputElement>('input[name="route"]')
    .forEach(radio => {
      radio.addEventListener('change', () => {
        route = radio.value as SearchRoute
        render()
      })
    })
  element('outside-warning').addEventListener('change', () => {
    outside = input('outside-warning').checked
    challenge = ''
    render()
  })
  element('challenge-reveal').addEventListener('click', reveal)
  element('bridge-grow').addEventListener('click', growFixture)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop()
    }
  })
}
