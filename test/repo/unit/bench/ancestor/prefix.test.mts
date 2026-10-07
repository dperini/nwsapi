import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  createPrefixVariants,
  createSharedPrefixVariants,
} from '../../../../../scripts/repo/bench/ancestor/prefix.mts'

const compiled =
  'function(c,f,s,r){var e,k=-1,j=-1,l=c.length;main:while(++k<l&&(e=c[k])!==undefined){if(e.classList.contains("box")){r[++j]=c[k];continue main;}}return r;}'
const inline =
  'function(c,f,s,r){var e,k=-1,j=-1,l=c.length;main:while(++k<l&&(e=c[k])!==undefined){var x=e;while(e&&(e=e.parentElement)){if(e.classList.contains("box")){r[++j]=c[k];continue main;}}e=x;}return r;}'

test('prefix variants retain node identity while caching repeated ancestor hits and misses per query', () => {
  const dom = new JSDOM(
    '<main class="box"><div><i></i><i></i><b></b></div></main><section><div><i></i><i></i></div></section>',
  )
  try {
    const document = dom.window.document
    const candidates = Array.from(document.querySelectorAll('i,b'))
    const wanted = Array.from(document.querySelectorAll('.box i'))
    let calls = 0
    const variants = createPrefixVariants(
      element => {
        calls += 1
        return element.classList.contains('box')
      },
      element => element.tagName === 'I',
    )
    const counts: number[] = []
    for (let index = 0, length = variants.length; index < length; index += 1) {
      calls = 0
      assert.deepEqual(variants[index]!(candidates, null, document, []), wanted)
      counts.push(calls)
    }
    assert.ok(counts[1]! < counts[0]!)
    document.querySelector('main')!.className = ''
    assert.deepEqual(variants[1]!(candidates, null, document, []), [])
  } finally {
    dom.window.close()
  }
})

test('shared prefix resolvers preserve cleanup and inline candidate results', () => {
  const dom = new JSDOM(
    '<main class="box"><div><i></i><i></i><b></b></div></main><section><div><i></i></div></section>',
  )
  try {
    const document = dom.window.document
    const candidates = Array.from(document.querySelectorAll('i'))
    const wanted = Array.from(document.querySelectorAll('.box i'))
    let cleanups = 0
    const sources = [undefined, inline]
    for (let index = 0, length = sources.length; index < length; index += 1) {
      const variants = createSharedPrefixVariants(
        compiled,
        {},
        element => element.tagName === 'I',
        () => {
          cleanups += 1
        },
        sources[index],
      )
      for (
        let variant = 0, count = variants.length;
        variant < count;
        variant += 1
      ) {
        assert.deepEqual(
          Array.from(variants[variant]!(candidates, null, document, [])),
          wanted,
        )
      }
    }
    assert.equal(cleanups, 3)
    const filtered = createSharedPrefixVariants(
      compiled,
      {},
      element => element.tagName === 'I',
      () => {},
    )
    assert.deepEqual(
      filtered[0]!(
        [...candidates, document.querySelector('b')!],
        null,
        document,
        [],
      ),
      wanted,
    )
    const failing = createSharedPrefixVariants(
      compiled,
      {},
      () => {
        throw Object.assign(new Error('suffix'), { code: 'SUFFIX_FAILED' })
      },
      () => {
        cleanups += 1
      },
    )
    assert.throws(() => failing[0]!(candidates, null, document, []), {
      code: 'SUFFIX_FAILED',
    })
    assert.equal(cleanups, 4)
    assert.throws(() =>
      createSharedPrefixVariants(
        '',
        {},
        () => true,
        () => {},
      ),
    )
    assert.throws(() =>
      createSharedPrefixVariants(
        compiled,
        {},
        () => true,
        () => {},
        'invalid',
      ),
    )
    const wrapped = compiled
      .replace('main:', 'try{main:')
      .replace('return r;}', '}finally{s.nthOfType(null, 2);}return r;}')
    const withFinally = createSharedPrefixVariants(
      wrapped,
      {},
      () => true,
      () => {},
    )
    assert.deepEqual(withFinally[0]!(candidates, null, document, []), wanted)
    const malformed = [
      compiled.replace('r[++j]=c[k];continue main;', 'return r;'),
      compiled.slice(0, -1),
    ]
    for (let index = 0, length = malformed.length; index < length; index += 1) {
      assert.throws(() =>
        createSharedPrefixVariants(
          malformed[index]!,
          {},
          () => true,
          () => {},
        ),
      )
    }
    const badInline = [
      inline + 'while(e&&(e=e.parentElement)){',
      inline.replace('var x=e;', 'var x=f;'),
      inline.replace('}e=x;', '}e=f;'),
      inline.replace('var e,', 'let e,'),
    ]
    for (let index = 0, length = badInline.length; index < length; index += 1) {
      assert.throws(() =>
        createSharedPrefixVariants(
          compiled,
          {},
          () => true,
          () => {},
          badInline[index],
        ),
      )
    }
  } finally {
    dom.window.close()
  }
})
