// Check observer and detached-node ownership while the factory document lives.
// Run with: node --expose-gc scripts/repo/bench/collection-memory.mts
import { JSDOM } from 'jsdom'
import factory from '../../../src/nwsapi.js'

if (!globalThis.gc) {
  throw new Error('Run with --expose-gc')
}
const { window } = new JSDOM('<main></main>')
const { document } = window
const observers: Array<WeakRef<MutationObserver>> = []
const nodes: Array<WeakRef<Element>> = []
const NativeObserver = window.MutationObserver
window.MutationObserver = class extends NativeObserver {
  constructor(callback: MutationCallback) {
    super(callback)
    observers.push(new WeakRef(this))
  }
}

function populate() {
  for (let i = 0; i < 20; ++i) {
    const engine = factory(window)
    const context = document.createElement('section')
    context.innerHTML = '<i class="item"></i>'.repeat(80)
    document.body.append(context)
    engine.select('i', context)
    engine.select('.item', document)
    nodes.push(new WeakRef(context.firstElementChild!))
    context.remove()
    engine.select('body', document)
  }
}

try {
  populate()
  // Separate turns let mutation callbacks, weak references, and finalizers
  // run. Do not dereference between collections: that keeps targets alive.
  for (let round = 0; round < 20; ++round) {
    await new Promise(resolve => setTimeout(resolve, 10))
    globalThis.gc()
  }
  const result = {
    nodes: nodes.length,
    retainedNodes: nodes.filter(reference => reference.deref()).length,
    observers: observers.length,
    retainedObservers: observers.filter(reference => reference.deref()).length,
  }
  console.log(JSON.stringify(result, null, 2))
  if (result.retainedNodes || result.retainedObservers) {
    process.exitCode = 1
  }
} finally {
  window.close()
}
