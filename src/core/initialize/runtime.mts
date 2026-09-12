import { attributeValueNS, hasAttributeNS } from '../dom/attribute.mts'
import {
  attrNamesOf,
  classOf,
  connectedOf,
  firstOf,
  idOf,
  tagOf,
  useLegacy,
} from '../dom/readers.mts'
import { byClass } from '../lookup/class.mts'
import {
  asciiLower,
  byTag,
  byTags,
  hasForeignTypes,
  matchesTag,
} from '../lookup/tag.mts'
import { collectionCopy } from '../collection/copy.mts'
import { collectionSnapshot } from '../collection/snapshot/get.mts'
import { codePointToUTF16 } from '../unicode/code-point.mts'
import { concatCall, concatList } from '../collection/append.mts'
import { createCache } from '../cache/plan.mts'
import { createWeakMap } from '../cache/weak-map.mts'
import { documentOrder, mergeResults, unique } from '../collection/order.mts'
import { isInstanceOf, toNodeList } from '../collection/node-list.mts'
import { switchContext } from '../dom/context.mts'
import type { EngineState } from '../state/engine.d.ts'
import { byId, byIdRaw } from '../lookup/id.mts'
import { byTagNS } from '../lookup/namespace.mts'
import {
  escapeIdentifier,
  stringFromCodePoint,
  unescapeIdentifier,
} from '../parser/identifier.mts'
import { matchLogical, matchNth } from '../parser/logical.mts'
import { normalizeCombinators } from '../parser/combinator.mts'
import { splitList } from '../parser/list.mts'
import type { Primordials } from '../state/types.mts'
export function initializeRuntime(engine: EngineState) {
  engine.version = 'nwsapi-2.3.0-prerelease'
  engine.primordials = (
    engine.Factory as typeof engine.Factory & { _primordials: Primordials }
  )['_primordials']
  engine.hostReaders = engine.global.hostReaders
  engine.doc = engine.global.document
  engine.root = engine.doc.documentElement
  engine.ELEMENT_PROTO =
    engine.global.Element && engine.global.Element.prototype
  engine.sliceCall = engine.primordials.ArrayPrototypeSlice
  engine.CFG = {
    // extensions
    operators: '[~*^$|]=|=',
    combinators: '[\\x20\\t>+~](?=[^>+~])',
  }
  engine.REX = {
    HasEscapes: /\\/,
    HexNumbers: /^[0-9a-fA-F]/,
    EscOrQuote: /^\\|[\x22\x27]/,
    RegExpChar: /(?!\\)[\\^$.,*+?()[\]{}|\/]/g,
    TrimSpaces: /^[\x20\t\r\n\f]+|[\x20\t\r\n\f]+$/g,
    SplitGroup: /(\([^)]*\)|\[[^[]*\]|\\.|[^,])+/g,
    CommaGroup: /(\s*,\s*)(?![^\x5b]*\x5d)(?![^\x28]*\x29)/g,
    FixEscapes: /\\([0-9a-fA-F]{1,6}[\x20\t\r\n\f]?|.)|([\x22\x27])/g,
    CombineWSP:
      /\\[0-9a-fA-F]{1,6}(?:\r\n|[\t\n\r\f\x20])?|[\n\r\f\x20]+(?=(?:[^']*['][^']*['])*[^']*$)(?=(?:[^"]*["][^"]*["])*[^"]*$)/g,
    TabCharWSP:
      /(\x20?\t+\x20?)(?=(?:[^']*['][^']*['])*[^']*$)(?=(?:[^"]*["][^"]*["])*[^"]*$)/g,
    LogicalPfx: /^:(is|where|matches|not|has)\x28/i,
  }
  engine.STD = {
    apimethods: /^(?:\w+|\*)\|/,
  }
  engine.Patterns = {
    treestruct: /^:(nth(?:-last)?(?:-child|-of-type))\(/i,
    structural:
      /^:(?:(scope|root|empty|(?:(?:first|last|only)(?:-child|\-of\-type)))\b)(.*)/i,
    linguistic: /^:(?:(dir)(?:\x28\s?([-\w]{2,})\s?(?:\x29|$)))(.*)/i,
    useraction:
      /^:(?:(hover|active|focus\-within|focus\-visible|focus)\b)(.*)/i,
    inputstate:
      /^:(?:(enabled|disabled|read\-only|read\-write|placeholder\-shown|default|autofill|-webkit\-autofill)\b)(.*)/i,
    inputvalue:
      /^:(?:(checked|indeterminate|required|optional|valid|invalid|in\-range|out\-of\-range)\b)(.*)/i,
    rsrc_state:
      /^:(?:(playing|paused|seeking|buffering|stalled|muted|volume\-locked)\b)(.*)/i,
    disp_state:
      /^:(?:(open|closed|modal|fullscreen|picture\-in\-picture|popover\-open|popover)\b)(.*)/i,
    time_state: /^:(?:(current|past|future)\b)(.*)/i,
    locationpc: /^:(?:(any\-link|link|visited|target|defined)\b)(.*)/i,
    logicalsel:
      /^:(?:(is|where|matches|not|has)(?:\x28\s?([^()]*|.*)\s?(?:\x29|$)))(.*)/i,
    pseudo_sng: /^:(?:(after|before|first\-letter|first\-line)\b)(.*)/i,
    children: /^[\x20\t\r\n\f]?\>[\x20\t\r\n\f]?(.*)/,
    adjacent: /^[\x20\t\r\n\f]?\+[\x20\t\r\n\f]?(.*)/,
    relative: /^[\x20\t\r\n\f]?\~[\x20\t\r\n\f]?(.*)/,
    ancestor: /^[\x20\t\r\n\f]+(.*)/,
    universal: /^(\*)(.*)/,
    namespace: /^(\*|[\w-]+)?\|(.*)/,
  }
  engine.reLinkName = /^(?:a|area)$/i
  engine.qsNotArgs = 'Not enough arguments'
  engine.qsInvalid = ' is not a valid selector'
  engine.reNthElem = /(:nth(?:-last)?-child)/i
  engine.reNthType = /(:nth(?:-last)?-of-type)/i
  engine.Config = {
    IDS_DUPES: true,
    FORGIVING: true,
    LEGACY: false,
    NODE_LIST: false,
    LOGERRORS: true,
    USR_EVENT: true,
    VERBOSITY: true,
  }
  engine.createWeakMap = createWeakMap.bind(
    null,
    engine,
  ) as EngineState['createWeakMap']
  engine.ATTR_STD_OPS = {
    '=': 1,
    '^=': 1,
    '$=': 1,
    '|=': 1,
    '*=': 1,
    '~=': 1,
  }
  engine.HTML_TABLE = {
    accept: 1,
    'accept-charset': 1,
    align: 1,
    alink: 1,
    axis: 1,
    bgcolor: 1,
    charset: 1,
    checked: 1,
    clear: 1,
    codetype: 1,
    color: 1,
    compact: 1,
    declare: 1,
    defer: 1,
    dir: 1,
    direction: 1,
    disabled: 1,
    enctype: 1,
    face: 1,
    frame: 1,
    hreflang: 1,
    'http-equiv': 1,
    lang: 1,
    language: 1,
    link: 1,
    media: 1,
    method: 1,
    multiple: 1,
    nohref: 1,
    noresize: 1,
    noshade: 1,
    nowrap: 1,
    readonly: 1,
    rel: 1,
    rev: 1,
    rules: 1,
    scope: 1,
    scrolling: 1,
    selected: 1,
    shape: 1,
    target: 1,
    text: 1,
    type: 1,
    valign: 1,
    valuetype: 1,
    vlink: 1,
  }
  engine.Combinators = {}
  engine.Selectors = {}
  engine.Operators = {
    '=': { p1: '^', p2: '$', p3: 'true' },
    '^=': { p1: '^', p2: '', p3: 'true' },
    '$=': { p1: '', p2: '$', p3: 'true' },
    '*=': { p1: '', p2: '', p3: 'true' },
    '|=': { p1: '^', p2: '(-|$)', p3: 'true' },
    '~=': {
      p1: '(^|[\\t\\n\\f\\r ])',
      p2: '([\\t\\n\\f\\r ]|$)',
      p3: 'true',
    },
  }
  engine.concatCall = concatCall.bind(null, engine) as EngineState['concatCall']
  engine.concatList = concatList.bind(null, engine) as EngineState['concatList']
  engine.CACHE_LIMIT = 4096
  engine.createCache = createCache.bind(
    null,
    engine,
  ) as EngineState['createCache']
  engine.toNodeList = toNodeList.bind(null, engine) as EngineState['toNodeList']
  engine.isInstanceOf = isInstanceOf.bind(
    null,
    engine,
  ) as EngineState['isInstanceOf']
  engine.documentOrder = documentOrder.bind(
    null,
    engine,
  ) as EngineState['documentOrder']
  engine.mergeResults = mergeResults.bind(
    null,
    engine,
  ) as EngineState['mergeResults']
  engine.hasDupes = false
  engine.unique = unique.bind(null, engine) as EngineState['unique']
  engine.switchContext = switchContext.bind(
    null,
    engine,
  ) as EngineState['switchContext']
  engine.codePointToUTF16 = codePointToUTF16.bind(
    null,
    engine,
  ) as EngineState['codePointToUTF16']
  engine.stringFromCodePoint = stringFromCodePoint.bind(
    null,
    engine,
  ) as EngineState['stringFromCodePoint']
  engine.escapeIdentifier = escapeIdentifier.bind(
    null,
    engine,
  ) as EngineState['escapeIdentifier']
  engine.unescapeIdentifier = unescapeIdentifier.bind(
    null,
    engine,
  ) as EngineState['unescapeIdentifier']
  engine.splitList = splitList.bind(null, engine) as EngineState['splitList']
  engine.matchLogical = matchLogical.bind(
    null,
    engine,
  ) as EngineState['matchLogical']
  engine.matchNth = matchNth.bind(null, engine) as EngineState['matchNth']
  engine.normalizeCombinators = normalizeCombinators.bind(
    null,
    engine,
  ) as EngineState['normalizeCombinators']
  engine.method = {
    '#': 'getElementById',
    '*': 'getElementsByTagName',
    '|': 'getElementsByTagNameNS',
    '.': 'getElementsByClassName',
  } as const
  engine.fetch = {
    '#': (n, c) => engine.byId(n, c),
    '*': (n, c) => engine.byTag(n, c),
    '|': (n, c) => engine.byTagNS(c, n),
    '.': (n: string, c) => (/[\t\n\f\r ]/.test(n) ? [] : engine.byClass(n, c)),
    '?': (n, c) => engine.byTags(n, c),
  }
  engine.byIdRaw = byIdRaw.bind(null, engine) as EngineState['byIdRaw']
  engine.byId = byId.bind(null, engine) as EngineState['byId']
  engine.byTagNS = byTagNS.bind(null, engine) as EngineState['byTagNS']
  engine.typeRoutes = engine.createCache<{
    broad: boolean
    remaining: number
  }>()
  engine.byTags = byTags.bind(null, engine) as EngineState['byTags']
  engine.collectionRoots = null
  engine.collectionStates = null
  engine.collectionSnapshot = collectionSnapshot.bind(
    null,
    engine,
  ) as EngineState['collectionSnapshot']
  engine.collectionCopy = collectionCopy.bind(
    null,
    engine,
  ) as EngineState['collectionCopy']
  engine.asciiLower = asciiLower.bind(null, engine) as EngineState['asciiLower']
  engine.matchesTag = matchesTag.bind(null, engine) as EngineState['matchesTag']
  engine.foreignTypeRoots = null
  engine.hasForeignTypes = hasForeignTypes.bind(
    null,
    engine,
  ) as EngineState['hasForeignTypes']
  engine.byTag = byTag.bind(null, engine) as EngineState['byTag']
  engine.byClass = byClass.bind(null, engine) as EngineState['byClass']
  engine.attributeValueNS = attributeValueNS.bind(
    null,
    engine,
  ) as EngineState['attributeValueNS']
  engine.hasAttributeNS = hasAttributeNS.bind(
    null,
    engine,
  ) as EngineState['hasAttributeNS']
  engine.includes = engine.primordials.StringPrototypeIncludes!
  engine.attrOf =
    (engine.hostReaders && engine.hostReaders.attrOf) ||
    function (e, name) {
      return e.getAttribute(name)
    }
  engine.hasAttrOf =
    (engine.hostReaders && engine.hostReaders.hasAttrOf) ||
    function (e, name) {
      return e.hasAttribute(name)
    }
  engine.tagOf = tagOf.bind(null, engine) as EngineState['tagOf']
  engine.idOf = idOf.bind(null, engine) as EngineState['idOf']
  engine.upOf =
    (engine.hostReaders && engine.hostReaders.upOf) ||
    function (e) {
      return e.parentElement
    }
  engine.nextOf =
    (engine.hostReaders && engine.hostReaders.nextOf) ||
    function (e) {
      return e.nextElementSibling
    }
  engine._prevOf =
    (engine.hostReaders && engine.hostReaders.prevOf) ||
    function (e) {
      return e.previousElementSibling
    }
  engine.firstOf = firstOf.bind(null, engine) as EngineState['firstOf']
  engine.attrNamesOf = attrNamesOf.bind(
    null,
    engine,
  ) as EngineState['attrNamesOf']
  engine.connectedOf = connectedOf.bind(
    null,
    engine,
  ) as EngineState['connectedOf']
  engine.modernReaders = {
    includes: engine.includes,
    attrOf: engine.attrOf,
    hasAttrOf: engine.hasAttrOf,
    tagOf: engine.tagOf,
    idOf: engine.idOf,
    legacyClassOf: function (e) {
      return engine.classOf(e) || ''
    },
    upOf: engine.upOf,
    nextOf: engine.nextOf,
    prevOf: engine._prevOf,
    firstOf: engine.firstOf,
    attrNamesOf: engine.attrNamesOf,
    connectedOf: engine.connectedOf,
  }
  engine.useLegacy = useLegacy.bind(null, engine) as EngineState['useLegacy']
  engine.classOf = classOf.bind(null, engine) as EngineState['classOf']
  engine.readDirect = {
    tag: function (v: string) {
      return v + '.localName'
    },
    id: function (v: string) {
      return v + '.id'
    },
    cls: function (v: string) {
      return 's.classOf(' + v + ')'
    },
    up: function (v: string) {
      return engine.hostReaders && engine.hostReaders.upOf
        ? 's.upOf(' + v + ')'
        : v + '.parentElement'
    },
    next: function (v: string) {
      return engine.hostReaders && engine.hostReaders.nextOf
        ? 's.nextOf(' + v + ')'
        : v + '.nextElementSibling'
    },
    prev: function (v: string) {
      return engine.hostReaders && engine.hostReaders.prevOf
        ? 's.prevOf(' + v + ')'
        : v + '.previousElementSibling'
    },
    attr: function (v: string, name: string) {
      return engine.hostReaders && engine.hostReaders.attrOf
        ? 's.attrOf(' + v + ',"' + name + '")'
        : v + '.getAttribute("' + name + '")'
    },
    has: function (v: string, name: string) {
      return engine.hostReaders && engine.hostReaders.hasAttrOf
        ? 's.hasAttrOf(' + v + ',"' + name + '")'
        : v + '.hasAttribute("' + name + '")'
    },
  }
  engine.readGuarded = {
    tag: engine.readDirect.tag,
    id: engine.readDirect.id,
    cls: engine.readDirect.cls,
    up: engine.readDirect.up,
    next: engine.readDirect.next,
    prev: engine.readDirect.prev,
    attr: function (v: string, name: string) {
      return engine.hostReaders && engine.hostReaders.attrOf
        ? engine.readDirect.attr(v, name)
        : v + '.getAttribute&&' + v + '.getAttribute("' + name + '")'
    },
    has: function (v: string, name: string) {
      return engine.hostReaders && engine.hostReaders.hasAttrOf
        ? engine.readDirect.has(v, name)
        : v + '.hasAttribute&&' + v + '.hasAttribute("' + name + '")'
    },
  }
}
