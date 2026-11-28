import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import {
  createWasmInstalledQuery,
  type WasmQueryModule,
} from '../../../../src/adapter/wasm-query.mts'

test('WASM adapter converts oversized selectors without argument spreading', () => {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  const selector = `body${' '.repeat(120_000)}`
  let compiledText = ''
  let freed = 0
  const wasm = {
    compile_host_selector(units: Uint16Array) {
      // This would itself throw on old spread-based conversions at this size.
      compiledText = String.fromCharCode(...units.subarray(0, 100))
      return {
        free() {
          freed++
        },
      }
    },
    BrowserSnapshot: class {
      set_ids_dupes() {}
      set_route_planner() {}
      set_route_planner_host() {}
      push_node() {
        return true
      }
      set_attribute() {
        return true
      }
      set_form_property() {
        return true
      }
      set_target() {
        return true
      }
      set_custom_element_defined() {
        return true
      }
      set_directionality() {
        return true
      }
      set_has_child() {
        return true
      }
      set_has_offset_dimensions() {
        return true
      }
      set_host_states() {
        return true
      }
      query() {
        return new Uint32Array()
      }
      free() {}
    },
  } satisfies WasmQueryModule

  const query = createWasmInstalledQuery(
    wasm,
    window.document,
    () => 'ltr',
    undefined,
    false,
    () => false,
    () => true,
    () => true,
    () => true,
    () => undefined,
    () => 4,
    () => 1024 * 1024,
    () => false,
    () => false,
    () => false,
    () => undefined,
    () => undefined,
  )

  assert.deepEqual(query('select', selector, window.document), [])
  assert.equal(compiledText, selector.slice(0, 100))
  assert.equal(freed, 1)
  window.close()
})
