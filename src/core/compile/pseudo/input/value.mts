import type { CompileState } from '../../state.mts'

export function compilePseudoInputValue(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'checked':
      state.source =
        'n=e.localName;' +
        'if((("input"==n||/^input$/i.test(n))&&' +
        '(s.includes("|radio|checkbox|","|"+e.type+"|")&&e.checked))||' +
        '(("option"==n||/^option$/i.test(n))&&(e.selected||e.checked))' +
        '){' +
        state.source +
        '}'
      break
    case 'indeterminate':
      if (state.engine.S_VARS.indexOf('_t') < 0) {
        state.engine.S_VARS.push('_t')
      }
      state.source =
        '_t=e.type;n=e.localName;' +
        'if((("progress"==n||/^progress$/i.test(n))&&!e.hasAttribute("value"))||' +
        '(("input"==n||/^input$/i.test(n))&&("checkbox"==_t&&e.indeterminate&&!e.switch&&!e.hasAttribute("switch"))||' +
        '("radio"==_t&&e.name&&!s.first("input[name="+e.name+"]:checked",e.form))' +
        ')){' +
        state.source +
        '}'
      break
    case 'required':
      state.source = 'if(s.isRequired(e)){' + state.source + '}'
      break
    case 'optional':
      state.source =
        'n=e.localName;if((("button"==n||"input"==n||"select"==n||"textarea"==n||/^(?:button|input|select|textarea)$/i.test(n))&&!s.isRequired(e))' +
        '){' +
        state.source +
        '}'
      break
    case 'invalid':
      state.source =
        'n=e.localName;if(((' +
        '(("form"==n||/^form$/i.test(n))&&!e.noValidate)||' +
        '(e.willValidate&&!e.formNoValidate))&&!e.checkValidity())||' +
        '(("fieldset"==n||/^fieldset$/i.test(n))&&s.first(":invalid",e))||' +
        '(n.indexOf("-")>=0&&s.matchesNative(e,":invalid"))' +
        '){' +
        state.source +
        '}'
      break
    case 'valid':
      state.source =
        'n=e.localName;if(((' +
        '(("form"==n||/^form$/i.test(n))&&!e.noValidate)||' +
        '(e.willValidate&&!e.formNoValidate))&&e.checkValidity())||' +
        '(("fieldset"==n||/^fieldset$/i.test(n))&&!s.first(":invalid",e))||' +
        '(n.indexOf("-")>=0&&s.matchesNative(e,":valid"))' +
        '){' +
        state.source +
        '}'
      break
    case 'in-range':
    case 'out-of-range':
      if (state.engine.S_VARS.indexOf('_t') < 0) {
        state.engine.S_VARS.push('_t')
      }
      if (state.engine.S_VARS.indexOf('_u') < 0) {
        state.engine.S_VARS.push('_u')
      }
      state.source =
        'n=e.localName;' +
        'if(("input"==n||/^input$/i.test(n))&&' +
        '(e.willValidate&&!e.formNoValidate)&&' +
        '(_u=e.validity)&&' +
        '(s.includes("|date|datetime-local|month|number|range|time|week|","|"+(_t=e.type)+"|"))&&' +
        ('in-range' == state.match![1]
          ? '(!_u.rangeUnderflow&&!_u.rangeOverflow)'
          : '(_u.rangeUnderflow||_u.rangeOverflow)') +
        '&&("range"==_t||e.getAttribute("min")||e.getAttribute("max"))' +
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
