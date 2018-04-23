const nwsapiFactory = require('../src/nwsapi');

// minimal fake global object, for testing nwsapi

class Document {
  constructor(...children) {
    this.documentElement = new Element({
      nodeName: 'HTML',
      children,
      ownerDocument: this 
    });
    this.nodeType = 9;
    this.firstElementChild = this.documentElement;
  }
  getElementsByTagNameNS(ns, tag) {
    return this.firstElementChild.getElementsByTagNameNS(ns, tag);
  }
  getElementsByTagName(tag) {
    return this.firstElementChild.getElementsByTagName(tag);
  }
}

class Element {
  constructor({nodeName = 'DIV', attrs = [], ownerDocument, children = []}) {
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this.nodeName = nodeName;
    this.localName = nodeName.split(':')[1];
    this.prefix = nodeName.split(':')[0];
    this._attrs = new Map(attrs);
    this.parentNode = null;
    this.nextElementSibling = null;
    this.previousElementSibling = null;

    children.forEach((el, i) => {
      el.parentNode = this;
      el.ownerDocument = this.ownerDocument;

      if (children[i-1]) {
        children[i-1].nextElementSibling = el;
        el.previousElementSibling = children[i-1];
      }
      if (children[i+1]) {
        children[i+1].previousElementSibling = el;
        el.nextElementSibling = children[i+1];
      }
    })
    this.firstElementChild = children[0];

    // nwsapi doesn't use children, but only firstElementChild, nextElementSibling, previousElementSibling
  }

  get className() {
    return this.getAttribute('class') || '';
  }
  get id() {
    return this.getAttribute('id') || '';
  }
  get parentElement() {
    return this.parentNode && this.parentNode === 1 ? this.parentNode : null;
  }
  get children() {
    throw new Error('not impl')
  }
  get childNodes() {
    throw new Error('not impl')
  }
  get childElementCount() {
    throw new Error('not impl')
  }
  getElementsByTagNameNS(ns, tag) {
    const els = this.nodeName === tag ? [this] : [];
    let child = this.firstElementChild;
    while (child) {
      els.push(...child.getElementsByTagNameNS(ns, tag));
      child = child.nextElementSibling;
    }
    return els;
  }
  getElementsByTagName(tag) {
    return this.getElementsByTagNameNS('*', tag);
  }
  getAttribute(key) {
    return this._attrs.get(key);
  }
  setAttribute(key, value) {
    return this._attrs.set(key, value);
  }
  removeAttribute(key) {
    return this._attrs.delete(key);
  }
}

const createElement = (nodeName, attrs = []) => (...children) => new Element({
  nodeName,
  attrs,
  children
})

const self = {
  DOMException: Error,
  Document,
  Element,
  document: new Document(
    createElement('HEAD')(),
    createElement('BODY')(
      createElement('DIV')(),
      createElement('DIV')(
        createElement('SPAN', [['class', 'foo']])()
      )
    )
  )
};

const nwsapi = nwsapiFactory(self);

console.assert(nwsapi.select('DIV', self.document).length === 2);
console.assert(nwsapi.select('div', self.document).length === 0);

