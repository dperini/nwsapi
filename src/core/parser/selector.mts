import type { EngineState } from '../state/types.mts'
export function parse(
  engine: EngineState,
  selectors: string | string[] | null,
  type: boolean,
): string[] | false | null | undefined {
  var validateSelectorGroupsDone = false
  var validateSelectorGroupsValue!: false | string[] | null | undefined

  var parsed: string

  // arguments validation
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return invalidInput()
  } else if (arguments[1] === '') {
    engine.emit("''" + engine.qsInvalid)
    return invalidInput()
  } else if (/^[.#]?\d/.test(selectors as string)) {
    engine.emit("''" + engine.qsInvalid)
    return invalidInput()
  }

  // input NULL or UNDEFINED
  if (typeof selectors != 'string') {
    selectors = '' + selectors
  }

  selectors = engine.stringContinuations(engine.selectorComments(selectors))
  if (!engine.validBlocks(selectors)) {
    engine.emit("'" + selectors + "'" + engine.qsInvalid)
    return type ? engine.none : false
  }
  // normalize input string
  parsed = selectors
    .replace(/\x00|\\$/g, '\ufffd')
    .replace(engine.REX.CombineWSP, function (part: string) {
      return part[0] == '\\' ? part.replace(/\r\n/g, '\x20') : '\x20'
    })
    .replace(engine.REX.TabCharWSP, '\t')
    .replace(engine.REX.CommaGroup, ',')
    .replace(engine.REX.TrimSpaces, '')

  // parse, validate and split possible compound selectors
  {
    validateSelectorGroups()
    if (validateSelectorGroupsDone) {
      return validateSelectorGroupsValue
    }
  }

  var groups = selectors as unknown as string[] | null
  if (groups && !groups.every(engine.validPseudoSyntax)) {
    engine.emit("'" + parsed + "'" + engine.qsInvalid)
    return type ? engine.none : false
  }
  return groups

  function invalidInput() {
    return engine.Config.VERBOSITY ? undefined : type ? engine.none : false
  }

  function validateSelectorGroups() {
    if (
      (selectors = parsed.match(engine.reValidator)) &&
      (selectors as string[]).join('') == parsed
    ) {
      selectors = engine.splitList(parsed)
      if (parsed[parsed.length - 1] == ',') {
        engine.emit(engine.qsInvalid)
        {
          validateSelectorGroupsValue = engine.Config.VERBOSITY
            ? undefined
            : type
              ? engine.none
              : false
          validateSelectorGroupsDone = true
          return
        }
      }
    } else {
      if (engine.Config.FORGIVING) {
        // forgiving pseudos allow to continue even after parse errors
        if (
          !(
            engine.includes(parsed, ':is(') ||
            engine.includes(parsed, ':where(')
          )
        ) {
          // 'selectors' holds the fragments the validator did match,
          // which read as a mangled selector once joined by String()
          engine.emit("'" + parsed + "'" + engine.qsInvalid)
          {
            validateSelectorGroupsValue = engine.Config.VERBOSITY
              ? undefined
              : type
                ? engine.none
                : false
            validateSelectorGroupsDone = true
            return
          }
        }
        // The validator cannot read this selector, but it holds a
        // forgiving list, which may be where the part it cannot read
        // lives. Hand on the selector itself rather than the fragments the
        // validator did match: compiled, the argument of an :is() or
        // :where() is evaluated inside a try/catch, so the unreadable part
        // drops out and the rest of the selector still applies. Returning
        // the fragments compiled each of them as a selector of its own,
        // which made 'div:not(:is(svg|div))' match every element in the
        // document rather than the divs.
        selectors = engine.splitList(parsed)
      }
    }
  }
}
