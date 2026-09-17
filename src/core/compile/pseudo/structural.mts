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
      // matches elements that don't contain elements or text nodes
      state.source =
        'n=e.firstChild;while(n&&!(/1|3/).test(n.nodeType)){n=n.nextSibling}if(!n){' +
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
    // :only-of-type, :last-of-type, :first-of-type
    case 'only-of-type':
      state.source =
        'o=e.localName;' +
        'n=e;while((n=n.nextElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
        'n=e;while((n=n.previousElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));}if(!n){' +
        state.source +
        '}'
      break
    case 'last-of-type':
      state.source =
        'n=e;o=e.localName;while((n=n.nextElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
        state.source +
        '}'
      break
    case 'first-of-type':
      state.source =
        'n=e;o=e.localName;while((n=n.previousElementSibling)&&(n.localName!=o||n.namespaceURI!=e.namespaceURI));if(!n){' +
        state.source +
        '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
