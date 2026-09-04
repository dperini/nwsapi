/*
 * A host shaped like the ones Config.LEGACY exists for.
 *
 * The legacy handling cannot be tested against the browsers it was written
 * for, so this stands in for them: a Proxy over a jsdom document that hides
 * the APIs those browsers did not have and answers the ones they did the way
 * they did. Everything it does is a behavior that shipped:
 *
 *   - getElementsByTagName('*') and children included comment nodes
 *     (IE up to 8)
 *   - no hasAttribute, no getElementsByClassName, no getAttributeNames,
 *     no isConnected, no classList, no localName
 *   - no firstElementChild, nextElementSibling, previousElementSibling or
 *     parentElement, only the node-level traversal
 *   - getAttribute answered through the DOM property, so 'class' and 'for'
 *     were only reachable as className and htmlFor, a URL attribute came
 *     back resolved unless the second argument was 2, style came back as an
 *     object and a boolean attribute as true or false
 *   - attributes held every attribute the element could have, with
 *     specified saying which the markup had set
 *
 * The catalogue behind those: https://perfectionkills.com/,
 * https://github.com/david-mark/My-Library, jQuery's propFix and attrHooks,
 * and https://jakearchibald.com/2024/attributes-vs-properties/ for the
 * attribute-versus-property split itself.
 */

const HIDDEN = new Set([
  'hasAttribute',
  'getElementsByClassName',
  'getAttributeNames',
  'isConnected',
  'classList',
  'localName',
  'firstElementChild',
  'lastElementChild',
  'nextElementSibling',
  'previousElementSibling',
  'parentElement',
  'children',
  'closest',
  'matches',
  'webkitMatchesSelector',
  'msMatchesSelector',
  'querySelector',
  'querySelectorAll',
]);

// The names that host answered under a DOM property instead.
const PROPS = { 'class': 'className', 'for': 'htmlFor', 'colspan': 'colSpan' };

// The attributes it resolved to an absolute URL unless asked for the markup.
const URLS = new Set(['action', 'cite', 'data', 'href', 'longdesc', 'src', 'usemap']);

// Attributes it answered with the property's boolean rather than a string.
const BOOLEANS = new Set(['checked', 'disabled', 'selected', 'readonly', 'multiple']);

export function legacyHost(document, { comments = true } = {}) {
  const cache = new WeakMap();
  // proxy back to the node it stands for, so a method of the host is called
  // with the nodes it expects rather than with the wrappers
  const raw = new WeakMap();
  const unwrap = value => (value !== null && typeof value === 'object' && raw.has(value)
    ? raw.get(value) : value);

  const wrap = value => {
    if (value === null || typeof value !== 'object') { return value; }
    if (cache.has(value)) { return cache.get(value); }
    const nodeType = value.nodeType;
    const isNode = typeof nodeType === 'number';
    const isList = !isNode && typeof value.length === 'number' && typeof value.item === 'function';
    if (!isNode && !isList) { return value; }
    const proxy = isList ? asCollection(value) : new Proxy(value, nodeHandler);
    cache.set(value, proxy);
    raw.set(proxy, value);
    return proxy;
  };

  // A collection this host would have filled differently: it carried comment
  // nodes among the elements. Handed back as a plain array-like rather than a
  // live one, so its length and its indices always agree.
  function asCollection(collection) {
    const items = [];
    for (let i = 0; i < collection.length; ++i) {
      const node = collection.item(i);
      items.push(wrap(node));
      if (comments && node.ownerDocument) {
        items.push(wrap(node.ownerDocument.createComment('legacy')));
      }
    }
    const out = { length: items.length, item: index => items[index] ?? null };
    for (let i = 0; i < items.length; ++i) { out[i] = items[i]; }
    return out;
  }

  function attributeOf(element, name, mode) {
    const lower = String(name).toLowerCase();
    const node = element.attributes.getNamedItem(lower);
    if (!node) {
      // that host exposed the property under a different name for these, and
      // nothing at all under the markup name
      return null;
    }
    if (lower === 'style') { return element.style; }
    if (BOOLEANS.has(lower)) { return true; }
    if (URLS.has(lower) && mode !== 2) {
      // resolved against the document, the way it answered without the flag
      return `http://legacy.example/${node.value.replace(/^[./]+/, '')}`;
    }
    if (PROPS[lower]) { return null; }
    return node.value;
  }

  const nodeHandler = {
    get(target, key) {
      if (typeof key === 'string' && HIDDEN.has(key)) { return undefined; }

      if (key === 'getAttribute') {
        return (name, mode) => attributeOf(target, name, mode);
      }

      if (key === 'attributes') {
        // specified is what separates a set attribute from one the element
        // could merely have had
        const attrs = target.attributes;
        return new Proxy(attrs, {
          get(list, prop) {
            if (prop === 'length') { return list.length; }
            if (prop === 'getNamedItem') {
              return name => {
                const found = list.getNamedItem(String(name).toLowerCase());
                return found ? { name: found.name, value: found.value, specified: true } : null;
              };
            }
            if (typeof prop === 'string' && /^\d+$/.test(prop)) {
              const found = list[Number(prop)];
              return found ? { name: found.name, value: found.value, specified: true } : undefined;
            }
            const value = Reflect.get(list, prop);
            return typeof value === 'function' ? value.bind(list) : value;
          },
        });
      }

      // className and htmlFor were the way to reach those two attributes
      if (key === 'className') { return target.getAttribute('class') ?? ''; }
      if (key === 'htmlFor') { return target.getAttribute('for') ?? ''; }

      // nodeName was upper case for an HTML element, and the only name there
      if (key === 'nodeName') { return target.nodeName; }

      const value = Reflect.get(target, key);
      if (typeof value === 'function') {
        return (...args) => wrap(value.apply(target, args.map(unwrap)));
      }
      return wrap(value);
    },
    has(target, key) {
      if (typeof key === 'string' && HIDDEN.has(key)) { return false; }
      return Reflect.has(target, key);
    },
  };

  return wrap(document);
}
