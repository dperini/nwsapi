// WPT validity inputs run through the installed selector APIs. Expected
// stylesheet serialization strings are outside this adapter's contract.
function selectorParserAPIs(selector) {
  const element = document.createElement('div')
  const fragment = document.createDocumentFragment()
  return [
    ['Document.querySelector', () => document.querySelector(selector)],
    ['Document.querySelectorAll', () => document.querySelectorAll(selector)],
    ['Element.querySelector', () => element.querySelector(selector)],
    ['Element.querySelectorAll', () => element.querySelectorAll(selector)],
    ['DocumentFragment.querySelector', () => fragment.querySelector(selector)],
    [
      'DocumentFragment.querySelectorAll',
      () => fragment.querySelectorAll(selector),
    ],
    ['Element.matches', () => element.matches(selector)],
    ['Element.closest', () => element.closest(selector)],
  ]
}

function test_valid_selector(selector) {
  test(
    () => {
      for (const [name, run] of selectorParserAPIs(selector)) {
        try {
          run()
        } catch (error) {
          assert_unreached(name + ' rejected valid syntax: ' + error.name)
        }
      }
    },
    'Selector API accepts ' + JSON.stringify(selector),
  )
}

function test_valid_forgiving_selector(selector) {
  test_valid_selector(selector)
}

function test_invalid_selector(selector) {
  test(
    () => {
      for (const [name, run] of selectorParserAPIs(selector)) {
        assert_throws_dom('SyntaxError', run, name)
      }
    },
    'Selector API rejects ' + JSON.stringify(selector),
  )
}
