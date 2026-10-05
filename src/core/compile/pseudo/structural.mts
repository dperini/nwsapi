import type { CompileState } from '../state.mts'

export function compilePseudoStructural(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'scope':
      // use the root (documentElement) when comparing against a document
      state.source =
        'if(e===(s.from.nodeType===9?s.from.documentElement:s.from)){' +
        state.source +
        '}'
      break
    case 'root':
      // there can only be one :root element, so exit the loop once found
      state.source =
        'if((e===s.doc.documentElement)){' +
        state.source +
        (state.mode ? 'break main;' : '') +
        '}'
      break
    case 'empty':
      // Content is an element, text or CDATA child; numeric compares
      // stay correct where a string regex would misread the digits.
      state.source =
        'n=e.firstChild;while(n&&n.nodeType!=1&&n.nodeType!=3&&n.nodeType!=4){n=n.nextSibling}if(!n){' +
        state.source +
        '}'
      break

    // *** child-indexed pseudo-classes
    // :first-child, :last-child, :only-child
    case 'only-child':
      state.source =
        'if((!e.nextElementSibling&&!e.previousElementSibling)){' +
        state.source +
        '}'
      break
    case 'last-child':
      state.source = 'if((!e.nextElementSibling)){' + state.source + '}'
      break
    case 'first-child':
      state.firstChildOnly = true
      state.source = 'if((!e.previousElementSibling)){' + state.source + '}'
      break

    // *** typed child-indexed pseudo-classes
    // :only-of-type, :last-of-type, :first-of-type. The namespace of
    // the candidate is invariant across the sibling scans, so it is
    // read once into a per-query temp instead of once per sibling.
    case 'only-of-type':
      if (state.engine.S_VARS.indexOf('_u') < 0) {
        state.engine.S_VARS.push('_u')
      }
      state.source =
        'o=e.localName;_u=e.namespaceURI;' +
        'n=e;while((n=n.nextElementSibling)&&(n.localName!=o||n.namespaceURI!=_u));if(!n){' +
        'n=e;while((n=n.previousElementSibling)&&(n.localName!=o||n.namespaceURI!=_u));}if(!n){' +
        state.source +
        '}'
      break
    case 'last-of-type':
      if (state.engine.S_VARS.indexOf('_u') < 0) {
        state.engine.S_VARS.push('_u')
      }
      state.source =
        'n=e;o=e.localName;_u=e.namespaceURI;while((n=n.nextElementSibling)&&(n.localName!=o||n.namespaceURI!=_u));if(!n){' +
        state.source +
        '}'
      break
    case 'first-of-type':
      if (state.engine.S_VARS.indexOf('_u') < 0) {
        state.engine.S_VARS.push('_u')
      }
      state.source =
        'n=e;o=e.localName;_u=e.namespaceURI;while((n=n.previousElementSibling)&&(n.localName!=o||n.namespaceURI!=_u));if(!n){' +
        state.source +
        '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
