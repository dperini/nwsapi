import type { CompileState } from '../state.d.ts'

export function compilePseudoInput(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'enabled':
      // the complement of ':disabled' over the same elements
      state.source =
        'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
        '"disabled" in e&&!s.isDisabled(e))||(e.localName.indexOf("-")>=0&&s.matchesNative(e,":enabled"))){' +
        state.source +
        '}'
      break
    case 'disabled':
      state.source =
        'if((("form" in e||/^optgroup$/i.test(e.localName))&&' +
        '"disabled" in e&&s.isDisabled(e))||(e.localName.indexOf("-")>=0&&s.matchesNative(e,":disabled"))){' +
        state.source +
        '}'
      break
    // Missing HTML input type is text. Avoid the host's type
    // normalization getter on this common path.
    case 'read-only':
    case '-moz-read-only':
    case 'read-write':
    case '-moz-read-write':
      state.source =
        'n=e.localName;if(' +
        (state.match![1]!.indexOf('read-only') >= 0 ? '!' : '') +
        '(/^input$/i.test(n)?' +
        '((e.namespaceURI=="http://www.w3.org/1999/xhtml"&&!e.hasAttribute("type")||s.includes("|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|","|"+e.type+"|"))&&!e.readOnly&&!s.isDisabled(e)):' +
        '/^textarea$/i.test(n)?!e.readOnly&&!s.isDisabled(e):s.isContentEditable(e))' +
        '){' +
        state.source +
        '}'
      break
    case 'autofill':
    case '-webkit-autofill':
      state.source =
        'if(s.matchesNative(e,":autofill")||s.matchesNative(e,":-webkit-autofill")){' +
        state.source +
        '}'
      break
    case 'placeholder-shown':
      state.source =
        'if((' +
        '(/^(?:input|textarea)$/i.test(e.localName))&&e.hasAttribute("placeholder")&&' +
        '(s.includes("|textarea|password|number|search|email|text|tel|url|","|"+e.type+"|"))&&' +
        'e.value==""' +
        ')){' +
        state.source +
        '}'
      break
    case 'default':
      state.source =
        'if(("form" in e && e.form)){' +
        'var x=0;n=[];' +
        'if(e.type=="image")n=e.form.getElementsByTagName("input");' +
        'if(e.type=="submit")n=e.form.elements;' +
        'while(n[x]&&e!==n[x]){' +
        'if(n[x].type=="image")break;' +
        'if(n[x].type=="submit")break;' +
        'x++;' +
        '}' +
        '}' +
        'if((e.form&&(e===n[x]&&s.includes("|image|submit|","|"+e.type+"|"))||' +
        '((/^option$/i.test(e.localName))&&e.defaultSelected)||' +
        '((s.includes("|radio|checkbox|","|"+e.type+"|"))&&e.defaultChecked)' +
        ')){' +
        state.source +
        '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
