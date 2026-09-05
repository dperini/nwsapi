"use strict";

const assert = require("assert");
const Module = require("module");
const nwsapi = require("../src/nwsapi");

const load = Module._load;
Module._load = function(request, parent, isMain) {
  return request == "nwsapi" ? nwsapi : load(request, parent, isMain);
};

const { JSDOM } = require("jsdom");
Module._load = load;

const dom = new JSDOM("<div></div>");
const element = dom.window.document.querySelector("div");
const matches = dom.window.Element.prototype.matches;
let calls = 0;

dom.window.Element.prototype.matches = function(selector) {
  ++calls;
  if (calls > 10) {
    throw new Error("Element.matches recursively entered NWSAPI");
  }
  return matches.call(this, selector);
};

[
  ":modal",
  ":fullscreen",
  ":open",
  ":closed",
  ":picture-in-picture"
].forEach(function(selector) {
  calls = 0;
  assert.strictEqual(element.matches(selector), false);
  assert.ok(calls <= 3, selector + " recursively entered NWSAPI");
});

const matcher = nwsapi({
  document: dom.window.document,
  DOMException: dom.window.DOMException
});
let nativeCalls = 0;

element.matches = function(selector) {
  ++nativeCalls;
  return selector == ":modal";
};

assert.strictEqual(matcher.match(":modal", element), true);
assert.strictEqual(nativeCalls, 1);
