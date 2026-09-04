'use strict';

const createNwsapi = require('../src/nwsapi.js');

function createGlobal() {
  const documentElement = {
    namespaceURI: 'http://www.w3.org/1999/xhtml'
  };
  const document = {
    nodeType: 9,
    contentType: 'text/html',
    compatMode: 'CSS1Compat',
    documentElement: documentElement,
    addEventListener: function() { },
    createElement: function(name) {
      return { localName: name.toLowerCase() };
    }
  };

  return {
    document: document,
    DOMException: Error,
    NodeList: Array
  };
}

function createElement(document) {
  return {
    nodeType: 1,
    localName: 'div',
    ownerDocument: document,
    hasAttribute: function() { return false; }
  };
}

describe('display-state native matching', function() {
  test('does not call a module-backed Element#matches', function() {
    const delegatedGlobal = createGlobal();
    const delegatedDom = createNwsapi(delegatedGlobal);
    const delegatedElement = createElement(delegatedGlobal.document);
    const delegatedMatches = jest.fn(function(selector) {
      return delegatedDom.match(selector, delegatedElement);
    });

    delegatedElement.matches = delegatedMatches;

    [
      ':open',
      ':closed',
      ':modal',
      ':fullscreen',
      ':picture-in-picture'
    ].forEach(function(selector) {
      expect(delegatedDom.match(selector, delegatedElement)).toBe(false);
    });

    delegatedElement.hasAttribute = function(name) {
      return name == 'popover';
    };
    expect(delegatedDom.match(':popover-open', delegatedElement)).toBe(false);
    expect(delegatedMatches).not.toHaveBeenCalled();
  });

  test('uses the platform matcher captured by the factory', function() {
    const nativeGlobal = createGlobal();
    const nativeMatcher = jest.fn(function(selector) {
      return selector == ':fullscreen';
    });
    const nativeDom = createNwsapi(nativeGlobal, null, nativeMatcher);
    const nativeElement = createElement(nativeGlobal.document);
    const nodeMatcher = jest.fn(function() {
      throw new Error('the node matcher must not be consulted');
    });

    nativeElement.matches = nodeMatcher;

    expect(nativeDom.match(':fullscreen', nativeElement)).toBe(true);
    expect(nativeMatcher).toHaveBeenCalledTimes(1);
    expect(nativeMatcher).toHaveBeenCalledWith(':fullscreen');
    expect(nodeMatcher).not.toHaveBeenCalled();
  });

  test('returns false when the captured platform matcher throws', function() {
    const throwingGlobal = createGlobal();
    const throwingMatcher = jest.fn(function() {
      throw new Error('unsupported selector');
    });
    const throwingDom = createNwsapi(throwingGlobal, null, throwingMatcher);

    expect(
      throwingDom.match(':fullscreen', createElement(throwingGlobal.document))
    ).toBe(false);
    expect(throwingMatcher).toHaveBeenCalledTimes(1);
  });
});
