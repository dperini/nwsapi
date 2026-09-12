import type { CompileState } from '../../state.mts'

export function compilePseudoInputValue(
  state: CompileState,
): string | false | undefined {
  state.match![1] = state.match![1]!.toLowerCase()
  switch (state.match![1]!) {
    case 'checked':
      state.source =
        'if((/^input$/i.test(e.localName)&&' +
        '(s.includes("|radio|checkbox|","|"+e.type+"|")&&e.checked)||' +
        '(/^option$/i.test(e.localName)&&(e.selected||e.checked))' +
        ')){' +
        state.source +
        '}'
      break
    case 'indeterminate':
      state.source =
        'if((/^progress$/i.test(e.localName)&&!e.hasAttribute("value"))||' +
        '(/^input$/i.test(e.localName)&&("checkbox"==e.type&&e.indeterminate&&!e.switch&&!e.hasAttribute("switch"))||' +
        '("radio"==e.type&&e.name&&!s.first("input[name="+e.name+"]:checked",e.form))' +
        ')){' +
        state.source +
        '}'
      break
    case 'required':
      state.source = 'if(s.isRequired(e)){' + state.source + '}'
      break
    case 'optional':
      state.source =
        'if((/^(?:button|input|select|textarea)$/i.test(e.localName)&&!s.isRequired(e))' +
        '){' +
        state.source +
        '}'
      break
    case 'invalid':
      state.source =
        'if(((' +
        '(/^form$/i.test(e.localName)&&!e.noValidate)||' +
        '(e.willValidate&&!e.formNoValidate))&&!e.checkValidity())||' +
        '(/^fieldset$/i.test(e.localName)&&s.first(":invalid",e))||' +
        '(e.localName.indexOf("-")>=0&&s.matchesNative(e,":invalid"))' +
        '){' +
        state.source +
        '}'
      break
    case 'valid':
      state.source =
        'if(((' +
        '(/^form$/i.test(e.localName)&&!e.noValidate)||' +
        '(e.willValidate&&!e.formNoValidate))&&e.checkValidity())||' +
        '(/^fieldset$/i.test(e.localName)&&!s.first(":invalid",e))||' +
        '(e.localName.indexOf("-")>=0&&s.matchesNative(e,":valid"))' +
        '){' +
        state.source +
        '}'
      break
    case 'in-range':
      state.source =
        'if((/^input$/i.test(e.localName))&&' +
        '(e.willValidate&&!e.formNoValidate)&&' +
        '(!e.validity.rangeUnderflow&&!e.validity.rangeOverflow)&&' +
        '(s.includes("|date|datetime-local|month|number|range|time|week|","|"+e.type+"|"))&&' +
        '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
        '){' +
        state.source +
        '}'
      break
    case 'out-of-range':
      state.source =
        'if((/^input$/i.test(e.localName))&&' +
        '(e.willValidate&&!e.formNoValidate)&&' +
        '(e.validity.rangeUnderflow||e.validity.rangeOverflow)&&' +
        '(s.includes("|date|datetime-local|month|number|range|time|week|","|"+e.type+"|"))&&' +
        '("range"==e.type||e.getAttribute("min")||e.getAttribute("max"))' +
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
