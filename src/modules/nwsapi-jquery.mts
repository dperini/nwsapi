/*
 * Copyright (C) 2007-2017 Diego Perini
 * All rights reserved.
 *
 * this is just a small example to show
 * how an extension for NWMatcher could be
 * adapted to handle special jQuery selectors
 *
 * Child Selectors
 * :even, :odd, :eq, :lt, :gt, :first, :last, :nth
 *
 * Pseudo Selectors
 * :has, :button, :header, :input, :checkbox, :radio, :file, :image
 * :password, :reset, :submit, :text, :hidden, :visible, :parent
 *
 */

// These are extension examples, not a complete implementation of jQuery.
// :has() is provided by the core Selectors Level 4 compiler.
NW.Dom.registerSelector(
  'jquery:child',
  /^\:((?:(nth|eq|lt|gt)\(([^()]*)\))|(?:even|odd|first|last))(.*)/i,
  function (match, source, mode) {
    // The registration pattern requires the name and each numeric argument.
    var name = match[1]!.toLowerCase(),
      condition,
      index
    // Never interpolate unvalidated selector text into generated JavaScript.
    if (match[2]) {
      if (
        !/^[+-]?\d+$/.test(match[3]!.trim()) ||
        Math.abs(Number(match[3])) > 9007199254740991
      ) {
        return { 'source': source, 'status': false }
      }
      index = String(Number(match[3]))
      name = match[2].toLowerCase()
    }
    switch (name) {
      case 'first':
      case 'last':
      case 'nth':
        // Preserve the original example's document-wide, same-tag indexing.
        source =
          'n=s.root.getElementsByTagName(e.nodeName);if(n[' +
          (name === 'first' ? '0' : name === 'last' ? 'n.length-1' : index) +
          ']===e){' +
          source +
          '}'
        break
      default:
        switch (name) {
          case 'odd':
            condition = '(jqIndex++%2)==1'
            break
          case 'even':
            condition = '(jqIndex++%2)==0'
            break
          case 'eq':
            condition = 'jqIndex++==' + index
            break
          case 'lt':
            condition = 'jqIndex++<' + index
            break
          default: // The registration pattern leaves only :gt here.
            condition = 'jqIndex++>' + index
            break
        }
        // match() supplies a singleton set. Selection counts candidates only
        // after their other conditions have passed, and skips callbacks too.
        if (mode === false) {
          source = 'if(' + condition + '){' + source + '}'
        } else {
          var macro =
            mode === null
              ? NW.Dom.S_BODY.replace('c[k]', 'c.item(k)')
              : NW.Dom.S_BODY
          source = source.replace(
            macro,
            'if(!(' + condition + '))continue main;' + macro,
          )
        }
        break
    }
    return { 'source': source, 'status': true, modvar: 'jqIndex=0' }
  },
)

NW.Dom.registerSelector(
  'jquery:pseudo',
  /^\:(checkbox|file|image|password|radio|reset|submit|text|button|input|header|hidden|visible|parent)(.*)/i,
  function (match, source) {
    var condition
    switch (match[1]!.toLowerCase()) {
      case 'checkbox':
      case 'file':
      case 'image':
      case 'password':
      case 'radio':
      case 'reset':
      case 'submit':
      case 'text':
        condition = '/^' + match[1] + '$/i.test(e.type)'
        break
      case 'button':
        condition =
          '/^button$/i.test(e.nodeName)||(/^input$/i.test(e.nodeName)&&e.type=="button")'
        break
      case 'input':
        condition = '/^(?:button|input|select|textarea)$/i.test(e.nodeName)'
        break
      case 'header':
        condition = '/^h[1-6]$/i.test(e.nodeName)'
        break
      case 'hidden':
        condition = '!e.offsetWidth&&!e.offsetHeight'
        break
      case 'visible':
        condition = 'e.offsetWidth||e.offsetHeight'
        break
      default: // The registration pattern leaves only :parent here.
        condition = 'e.firstChild'
        break
    }
    return { source: 'if(' + condition + '){' + source + '}', 'status': true }
  },
)
