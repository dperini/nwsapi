import type { CompileState } from '../../state.mts'

export function compilePseudoInput(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'enabled':
      // the complement of ':disabled' over the same elements
      state.source =
        'n=e.localName;' +
        'if((("form" in e||("optgroup"==n||/^optgroup$/i.test(n)))&&' +
        '"disabled" in e&&!s.isDisabled(e))||(n.indexOf("-")>=0&&s.matchesNative(e,":enabled"))){' +
        state.source +
        '}'
      break
    case 'disabled':
      state.source =
        'n=e.localName;' +
        'if((("form" in e||("optgroup"==n||/^optgroup$/i.test(n)))&&' +
        '"disabled" in e&&s.isDisabled(e))||(n.indexOf("-")>=0&&s.matchesNative(e,":disabled"))){' +
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
        '(("input"==n||/^input$/i.test(n))?' +
        '((e.namespaceURI=="http://www.w3.org/1999/xhtml"&&!e.hasAttribute("type")||s.includes("|date|datetime-local|email|month|number|password|search|tel|text|time|url|week|","|"+e.type+"|"))&&!e.readOnly&&!s.isDisabled(e)):' +
        '("textarea"==n||/^textarea$/i.test(n))?!e.readOnly&&!s.isDisabled(e):s.isContentEditable(e))' +
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
        'n=e.localName;if((' +
        '(("input"==n||"textarea"==n)||/^(?:input|textarea)$/i.test(n))&&e.hasAttribute("placeholder")&&' +
        '(s.includes("|textarea|password|number|search|email|text|tel|url|","|"+e.type+"|"))&&' +
        'e.value==""' +
        ')){' +
        state.source +
        '}'
      break
    case 'default':
      // Reads are hoisted per candidate; the scan index gets its own
      // slot because reusing the resolver's context parameter would
      // hand later tests a number instead of the context.
      if (state.engine.S_VARS.indexOf('_t') < 0) {
        state.engine.S_VARS.push('_t')
      }
      if (state.engine.S_VARS.indexOf('_u') < 0) {
        state.engine.S_VARS.push('_u')
      }
      if (state.engine.S_VARS.indexOf('_d') < 0) {
        state.engine.S_VARS.push('_d=0')
      }
      state.source =
        '_u=e.localName;_t=e.type;' +
        'if(("form" in e&&(o=e.form))){' +
        '_d=0;n=null;' +
        'if(_t=="image")n=o.getElementsByTagName("input");' +
        '_t=="submit"&&(n=o.elements);' +
        'while(n&&n[_d]&&e!==n[_d]){' +
        'if(n[_d].type=="image")break;' +
        'if(n[_d].type=="submit")break;' +
        '_d++;' +
        '}' +
        '}' +
        'if((o=e.form)&&((n&&e===n[_d])&&s.includes("|image|submit|","|"+_t+"|"))||' +
        '(("option"==_u||/^option$/i.test(_u))&&e.defaultSelected)||' +
        '((s.includes("|radio|checkbox|","|"+_t+"|"))&&e.defaultChecked)' +
        '){' +
        state.source +
        '}'
      break
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }
  return undefined
}
