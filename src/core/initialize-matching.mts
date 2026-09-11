import {
  ancestor,
  match_assert,
  match_collect,
  selectorComments,
  stringContinuations,
} from './ancestor.mts'
import {
  ancestorMask,
  clearAncestorMasks,
  isDefined,
  isHTML,
  isRequired,
  mayMatch,
  nthFiltered,
  tagBit,
} from './by-class.mts'
import { compileSelector } from './compile-selector.mts'
import { createNthElement } from './create-nth-element.mts'
import { createNthOfType } from './create-nth-of-type.mts'
import {
  canReuseAncestor,
  compile,
  emit,
  initialize,
  isCompound,
  setIdentifierSyntax,
} from './emit.mts'
import {
  hasSlotted,
  isDirection,
  isLanguage,
  validBlocks,
} from './has-slotted.mts'
import {
  configure,
  fullscreenState,
  isClosed,
  isContentEditable,
  isDisabled,
  isFocusable,
  isFullscreen,
  isLink,
  isMediaState,
  isModal,
  isOpen,
  isPictureInPicture,
  isPopoverOpen,
  matchesNative,
} from './is-content-editable.mts'
import type { EngineState } from './state.d.ts'
import type { DirectionHelpers } from './types.mts'
import {
  hasHost,
  isHost,
  prepareCompound,
  shadowParent,
  shadowRootOf,
  validPseudoStates,
  validPseudoSyntax,
  validPseudoTail,
} from './valid-pseudo-states.mts'
import {
  hasPseudoElement,
  isIdent,
  isPseudoExtension,
  prepareHas,
  readPseudo,
  treePseudo,
  validateLogical,
  validPseudoElement,
} from './validate-logical.mts'
export function initializeMatching(engine: EngineState) {
  engine.nthElement = createNthElement(engine)
  engine.nthFiltered = nthFiltered.bind(
    null,
    engine,
  ) as EngineState['nthFiltered']
  engine.nthOfType = createNthOfType(engine)
  engine.ancestorMasks = null
  engine.lastMaskNode = null
  engine.lastMaskValue = 0
  engine.tagBits = engine.primordials.ObjectCreate(null)
  engine.tagBit = tagBit.bind(null, engine) as EngineState['tagBit']
  engine.ancestorMask = ancestorMask.bind(
    null,
    engine,
  ) as EngineState['ancestorMask']
  engine.FILTER_SAMPLE = 64
  engine.FILTER_KEEP = 48
  engine.FILTER_RETRY = 4096
  engine.mayMatch = mayMatch.bind(null, engine) as EngineState['mayMatch']
  engine.clearAncestorMasks = clearAncestorMasks.bind(
    null,
    engine,
  ) as EngineState['clearAncestorMasks']
  engine.isHTML = isHTML.bind(null, engine) as EngineState['isHTML']
  engine.isDefined = isDefined.bind(null, engine) as EngineState['isDefined']
  engine.isRequired = isRequired.bind(null, engine) as EngineState['isRequired']
  engine.isContentEditable = isContentEditable.bind(
    null,
    engine,
  ) as EngineState['isContentEditable']
  engine.isDisabled = isDisabled.bind(null, engine) as EngineState['isDisabled']
  engine.isFocusable = isFocusable.bind(
    null,
    engine,
  ) as EngineState['isFocusable']
  engine.matchesNative = matchesNative.bind(
    null,
    engine,
  ) as EngineState['matchesNative']
  engine.matchingNative = null
  engine.matcherDoc = null
  engine.matcherRecord = null
  engine.matcherCache = null
  engine.isOpen = isOpen.bind(null, engine) as EngineState['isOpen']
  engine.isClosed = isClosed.bind(null, engine) as EngineState['isClosed']
  engine.fullscreenState = fullscreenState.bind(
    null,
    engine,
  ) as EngineState['fullscreenState']
  engine.isFullscreen = isFullscreen.bind(
    null,
    engine,
  ) as EngineState['isFullscreen']
  engine.isModal = isModal.bind(null, engine) as EngineState['isModal']
  engine.isPictureInPicture = isPictureInPicture.bind(
    null,
    engine,
  ) as EngineState['isPictureInPicture']
  engine.isPopoverOpen = isPopoverOpen.bind(
    null,
    engine,
  ) as EngineState['isPopoverOpen']
  engine.isLink = isLink.bind(null, engine) as EngineState['isLink']
  engine.isMediaState = isMediaState.bind(
    null,
    engine,
  ) as EngineState['isMediaState']
  engine.configure = configure.bind(null, engine) as EngineState['configure']
  engine.errors = 0
  engine.emit = emit.bind(null, engine) as EngineState['emit']
  engine.initialize = initialize.bind(null, engine) as EngineState['initialize']
  engine.setIdentifierSyntax = setIdentifierSyntax.bind(
    null,
    engine,
  ) as EngineState['setIdentifierSyntax']
  engine.compilePrefixes = [
    'selector:false:false:',
    'selector:false:true:',
    'selector:true:false:',
    'selector:true:true:',
    'selector:null:false:',
    'selector:null:true:',
    'relative:false:false:',
    'relative:false:true:',
    'relative:true:false:',
    'relative:true:true:',
    'relative:null:false:',
    'relative:null:true:',
  ]
  engine.F_INIT = '"use strict";return function Resolver(c,f,x,r,v)'
  engine.S_HEAD = 'var e,n,o,j=r.length-1,k=-1,l=c.length'
  engine.M_HEAD = 'var e,n,o'
  engine.N_HEAD = 'var e,n,o,j=r.length-1,k=-1,l=c.length'
  engine.S_LOOP = 'main:while(++k<l&&(e=c[k])!==undefined)'
  engine.M_LOOP = 'e=c;'
  engine.N_LOOP = 'main:while(++k<l&&(e=c.item(k))!==undefined)'
  engine.S_BODY = 'r[++j]=c[k];'
  engine.M_BODY = ''
  engine.N_BODY = 'r[++j]=c.item(k);'
  engine.S_TAIL = 'continue main;'
  engine.M_TAIL = 'r=true;'
  engine.N_TAIL = 'continue main;'
  engine.S_TEST = 'if(f(c[k])){break main;}'
  engine.M_TEST = 'f(c);'
  engine.N_TEST = 'if(f(c.item(k))){break main;}'
  engine.S_VARS = []
  engine.M_VARS = []
  engine.N_VARS = []
  engine.canReuseAncestor = canReuseAncestor.bind(
    null,
    engine,
  ) as EngineState['canReuseAncestor']
  engine.compile = compile.bind(null, engine) as EngineState['compile']
  engine.isCompound = isCompound.bind(null, engine) as EngineState['isCompound']
  engine.validateLogical = validateLogical.bind(
    null,
    engine,
  ) as EngineState['validateLogical']
  engine.prepareHas = prepareHas.bind(null, engine) as EngineState['prepareHas']
  engine.readPseudo = readPseudo.bind(null, engine) as EngineState['readPseudo']
  engine.isIdent = isIdent.bind(null, engine) as EngineState['isIdent']
  engine.hasPseudoElement = hasPseudoElement.bind(
    null,
    engine,
  ) as EngineState['hasPseudoElement']
  engine.treePseudo = treePseudo.bind(null, engine) as EngineState['treePseudo']
  engine.validPseudoElement = validPseudoElement.bind(
    null,
    engine,
  ) as EngineState['validPseudoElement']
  engine.isPseudoExtension = isPseudoExtension.bind(
    null,
    engine,
  ) as EngineState['isPseudoExtension']
  engine.validPseudoStates = validPseudoStates.bind(
    null,
    engine,
  ) as EngineState['validPseudoStates']
  engine.validPseudoTail = validPseudoTail.bind(
    null,
    engine,
  ) as EngineState['validPseudoTail']
  engine.validPseudoSyntax = validPseudoSyntax.bind(
    null,
    engine,
  ) as EngineState['validPseudoSyntax']
  engine.hasHost = hasHost.bind(null, engine) as EngineState['hasHost']
  engine.prepareCompound = prepareCompound.bind(
    null,
    engine,
  ) as EngineState['prepareCompound']
  engine.shadowRootOf = shadowRootOf.bind(
    null,
    engine,
  ) as EngineState['shadowRootOf']
  engine.shadowParent = shadowParent.bind(
    null,
    engine,
  ) as EngineState['shadowParent']
  engine.isHost = isHost.bind(null, engine) as EngineState['isHost']
  engine.hasSlotted = hasSlotted.bind(null, engine) as EngineState['hasSlotted']
  engine.directionality = (
    engine.Factory as typeof engine.Factory & {
      _direction: DirectionHelpers
    }
  )._direction.directionality
  engine.isDirection = isDirection.bind(
    null,
    engine,
  ) as EngineState['isDirection']
  engine.isLanguage = isLanguage.bind(null, engine) as EngineState['isLanguage']
  engine.validBlocks = validBlocks.bind(
    null,
    engine,
  ) as EngineState['validBlocks']
  engine.notFlag = 0
  engine.compileSelector = compileSelector.bind(
    null,
    engine,
  ) as EngineState['compileSelector']
  engine.ancestor = ancestor.bind(null, engine) as EngineState['ancestor']
  engine.match_assert = match_assert.bind(
    null,
    engine,
  ) as EngineState['match_assert']
  engine.match_collect = match_collect.bind(
    null,
    engine,
  ) as EngineState['match_collect']
  engine.selectorComments = selectorComments.bind(
    null,
    engine,
  ) as EngineState['selectorComments']
  engine.stringContinuations = stringContinuations.bind(
    null,
    engine,
  ) as EngineState['stringContinuations']
}
