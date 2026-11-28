import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { test } from 'vitest'

const wasmDir = process.env['NWSAPI_WASM_DIR']
const selectorCompatibility = JSON.parse(
  readFileSync(
    new URL('../common/fixture/selector/compatibility.json', import.meta.url),
    'utf8',
  ),
) as {
  selectors: string[]
  shadowSelectors: string[]
  xml: Array<{ name: string; html: string; selectors: string[] }>
}

test.skipIf(!wasmDir)(
  'browser installation runs WebAssembly and the optional jQuery selectors',
  async () => {
    const executablePath = process.env['NWSAPI_CHROMIUM']
    const browser = await chromium.launch(
      executablePath ? { executablePath } : {},
    )
    try {
      const page = await browser.newPage()
      const html = readFileSync(
        new URL('../common/fixture/native-wasm.html', import.meta.url),
        'utf8',
      ).replace(
        '__SELECTOR_COMPATIBILITY__',
        JSON.stringify(selectorCompatibility),
      )
      const resources = {
        'nwsapi.js': ['application/javascript', 'dist/nwsapi.js'],
        'legacy.js': [
          'application/javascript',
          'dist/modules/nwsapi-legacy.js',
        ],
        'jquery.js': [
          'application/javascript',
          'dist/modules/nwsapi-jquery.js',
        ],
        'nwsapi_wasm.js': [
          'application/javascript',
          path.join(wasmDir!, 'nwsapi_wasm.js'),
        ],
        'traversal.js': [
          'application/javascript',
          'dist/modules/nwsapi-traversal.js',
        ],
        'nwsapi_wasm_bg.wasm': [
          'application/wasm',
          path.join(wasmDir!, 'nwsapi_wasm_bg.wasm'),
        ],
      } as const
      await page.route('http://nwsapi.test/**', async route => {
        const name = new URL(route.request().url()).pathname.slice(1)
        if (!name) {
          await route.fulfill({ contentType: 'text/html', body: html })
          return
        }
        const resource = resources[name as keyof typeof resources]
        if (!resource) {
          await route.fulfill({ status: 404 })
          return
        }
        await route.fulfill({
          contentType: resource[0],
          body: readFileSync(resource[1]),
        })
      })
      await page.goto('http://nwsapi.test/')
      const output = await page
        .locator('html[data-done]')
        .getAttribute('data-done')
      assert.deepEqual(JSON.parse(output!), {
        first: true,
        second: true,
        plugin: true,
        multiplePluginPseudos: true,
        unicodeLocalNameRust: true,
        duplicateIdRust: true,
        missingAttributeCaseRust: true,
        pluginChained: {
          installed: ['b', 'a', 'unicode', 'hidden'],
          installedSecond: 'a',
          installedPositionalBeforeClass: ['a'],
          installedClassBeforePositional: ['a'],
          direct: ['b', 'a', 'unicode', 'hidden'],
          directSecond: 'a',
          directPositionalBeforeClass: ['a'],
          directClassBeforePositional: ['a'],
          nativeQueries: 4,
          fallbacks: 0,
        },
        routePlannerBridge: true,
        wasmBulkHasPlannerBridge: true,
        routePlannerHostBridge: true,
        cacheConfigBridge: true,
        wasmPlanCacheClear: true,
        pluginHidden: ['hidden'],
        pluginVisible: ['b', 'a', 'unicode'],
        pluginVisibilityUsesRust: true,
        pluginParent: true,
        pluginParentChildren: ['parentComment', 'emptyText'],
        pluginInput: true,
        nativeEmptyText: true,
        wasmEmptyText: true,
        nativeConstraintStates: [true, true, true, true],
        wasmConstraintStates: [true, true, true, true],
        nativeOptional: [
          'hiddenRequired',
          'rangeRequired',
          'colorRequired',
          'submitRequired',
          'buttonRequired',
        ],
        wasmOptional: [
          'hiddenRequired',
          'rangeRequired',
          'colorRequired',
          'submitRequired',
          'buttonRequired',
        ],
        nativeRequired: ['textRequired'],
        wasmRequired: ['textRequired'],
        wasmCompatibilityParity: true,
        wasmCompatibilityAcceptedCases: 426,
        wasmCompatibilityRustCases: 426,
        wasmCompatibilityByContext: {
          document: { accepted: 208, rust: 208 },
          main: { accepted: 208, rust: 208 },
          shadow: { accepted: 10, rust: 10 },
        },
        wasmCompatibilityCaseCount: 476,
        wasmCompatibilityNativeFallbacks: [],
        wasmCompatibilityFailures: [],
        wasmCompatibilitySelectorCount: selectorCompatibility.selectors.length,
        wasmXmlCompilationCases: selectorCompatibility.xml.flatMap(fixture =>
          fixture.selectors.map(selector => ({
            selector,
            compiled: !['s|item', 't|item', '[a|x]'].includes(selector),
          })),
        ),
        wasmPlansCompiled: true,
        wasmVersion: true,
        focus: true,
        focusVisible: true,
        focusWithin: true,
        active: true,
        modal: true,
        popover: true,
        detailsOpen: true,
        detailsClosed: true,
        paused: true,
        muted: true,
        indeterminate: true,
        placeholder: true,
        visited: true,
        visitedRust: true,
        stateOnlySelectorsRust: true,
        customState: true,
        customStateRust: true,
        escapedCustomState: true,
        escapedCustomStateRust: true,
        hasSlotted: true,
        hasSlottedRust: true,
        shadowLanguage: true,
        shadowLanguageRust: true,
        hasSlottedArgument: true,
        hasSlottedArgumentRust: true,
        slottedMutationClearsState: true,
        slottedMutationRust: true,
        slottedMutationRestoresState: true,
        unmatchedSlottedArgument: true,
        unmatchedSlottedArgumentRust: true,
        multipleSlottedArguments: true,
        multipleSlottedArgumentsRust: true,
        nestedSlottedArgument: true,
        nestedSlottedArgumentRust: true,
        slottedPseudoElement: true,
        slottedPseudoElementRust: true,
        shadowHostParity: true,
        shadowHostRust: true,
        userState: true,
        userStateRust: true,
        valid: true,
        invalid: true,
        invalidForm: true,
        invalidFieldset: true,
        outOfRange: true,
        inRange: true,
        defaultValue: true,
        defaultSubmitter: true,
        columnCombinatorRust: true,
        installedMethodsRust: true,
        shadowIsolationRust: true,
        installedMethodDetails: {
          match: true,
          closest: true,
          expectedIds: ['a'],
          actualIds: ['a'],
          listLength: 1,
          listIsNodeList: true,
          listIsStatic: true,
          queryDelta: 3,
          fallbackDelta: 0,
        },
        emptyForgivingListsRust: true,
        nthCommentOfRust: true,
        lateCustomFallback: false,
        blockPassThroughRust: true,
        blockLocalNameCallbacksRust: true,
        pluginRemainsRustAfterCustom: true,
        prefixAliasRust: true,
        customOperatorRust: true,
        customEqualityOperatorRust: true,
        mixedCustomOperatorAndResolverRust: true,
        multipleCustomOperatorsRust: true,
        negativeOperatorAliasesRust: true,
        negativeOperatorResults: [
          'b,unicode,hidden',
          'b,unicode,hidden',
          'a,unicode',
          'b,unicode,hidden',
        ],
        negativeOperatorQueryDeltas: [1, 1, 1, 1],
        negativeOperatorFallbackDelta: 0,
        customWordOperatorRust: true,
        mixedPatternRust: true,
        overlappingRuns: [
          [true, true, 1],
          [true, true, 1],
          [true, false, 1],
        ],
        zeroOrMorePatternRust: true,
        unicodeRegexRust: true,
        optionalClassRust: true,
        dotPatternRust: true,
        dotBoundedRust: true,
        asciiCharacterClassesRust: true,
        regexWordBoundariesRust: true,
        boundedClassRust: true,
        regexWhitespaceRust: true,
        negatedClassesRust: true,
        customCombinatorRust: true,
        zeroWidthResolverFallback: false,
        legacyQueriesRust: true,
        up: true,
        next: true,
        previous: true,
        downFirst: true,
        downZero: true,
        downIndex: true,
        downSelector: true,
        strictForgiving: true,
        strictFallback: true,
        restored: true,
        root: true,
        foreign: true,
        attr: true,
        state: ['default'],
        target: true,
        scopedTarget: true,
        scopedTargetRust: true,
        defined: true,
        direction: true,
      })
      await page.route('http://nwsapi.test/quirks', route =>
        route.fulfill({
          contentType: 'text/html',
          body: `<main><p class="Mixed"></p></main><script src="/nwsapi.js"></script>
          <script type="module">
            import init, * as wasm from '/nwsapi_wasm.js'
            await init()
            const query = NW.Dom.createWasmInstalledQuery(wasm)
            const p = document.getElementsByTagName('p')[0]
            const found = query('select', 'main > :is(.mixed, b)', document)
            document.body.dataset.result = JSON.stringify([document.compatMode, found?.length, found?.[0] === p])
          </script>`,
        }),
      )
      await page.goto('http://nwsapi.test/quirks')
      await page.waitForSelector('body[data-result]')
      assert.deepEqual(
        JSON.parse((await page.locator('body').getAttribute('data-result'))!),
        ['BackCompat', 1, true],
      )
    } finally {
      await browser.close()
    }
  },
)
