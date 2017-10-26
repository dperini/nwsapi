# [NWSAPI](http://dperini.github.io/nwsapi/)

Fast CSS Selectors API Engine


## Installation

To include NWSAPI in a standard web page:

```html
<script type="text/javascript" src="nwsapi.js"></script>
```

To include NWSAPI in a standard web page and automatically replace the native QSA:

```html
<script type="text/javascript" src="nwsapi.js" onload="NW.Dom.install()"></script>
```

To use it with Node.js:

```
$ npm install nwsapi (not published on npm yet)
```

NWSAPI currently supports browsers (as a global, `NW.Dom`) and headless environments (as a CommonJS module).


## Supported Selectors

Here is a list of all the CSS2/CSS3/CSS4 [Supported selectors](https://github.com/dperini/nwsapi/wiki/CSS-supported-selectors).


## Features and Compliance

You can read more about NWSAPI [features and compliance](https://github.com/dperini/nwsapi/wiki/Features-and-compliance) on the wiki.


## API

### DOM Selection

#### `ancestor( selector, context, callback )`

Returns a reference to the nearest ancestor element matching `selector`, starting at `context`. Returns `null` if no element is found. If `callback` is provided, it is invoked for the matched element.

#### `first( selector, context, callback )`

Returns a reference to the first element matching `selector`, starting at `context`. Returns `null` if no element matches. If `callback` is provided, it is invoked for the matched element.

#### `match( selector, element, callback )`

Returns `true` if `element` matches `selector`, starting at `context`; returns `false` otherwise. If `callback` is provided, it is invoked for the matched element.

#### `select( selector, context, callback )`

Returns an array of all the elements matching `selector`, starting at `context`; returns empty `Array` otherwise. If `callback` is provided, it is invoked for each matching element.


### DOM Helpers

#### `byId( id, from )`

Returns a reference to the first element with ID `id`, optionally filtered to descendants of the element `from`.

#### `byTag( tag, from )`

Returns an array of elements having the specified tag name `tag`, optionally filtered to descendants of the element `from`.

#### `byClass( class, from )`

Returns an array of elements having the specified class name `class`, optionally filtered to descendants of the element `from`.


### Engine Configuration

#### `configure( options )`

The following is the list of currently available configuration options, their default values and descriptions, they are boolean flags that can be set to `true` or `false`:

* `ESCAPECHR`: true  - true to allow CSS escaped identifiers, false to disallow
* `NON_ASCII`: true  - true to allow identifiers containing non-ASCII (utf-8) chars
* `SELECTOR3`: true  - switch syntax RE, true to use Level 3, false to use Level 2
* `UNICODE16`: true  - true to allow identifiers containing Unicode (utf-16) chars
* `BUGFIX_ID`: true  - true to bugfix forms when using reserved words for controls
* `DUPLICATE`: true  - true to allow multiple elements having the same id (strict)
* `SIMPLENOT`: true  - true to disallow complex selectors nested in ':not()' classes
* `SVG_LCASE`: false - false to disallow lowercase SVG elements in HTML documents
* `USE_HTML5`: true  - true to use HTML5 specs for ":checked" and similar UI states
* `VERBOSITY`: true  - true to throw exceptions, false to skip throwing exceptions
* `LOGERRORS`: true  - true to print console errors or warnings, false to mute them

Example:

```js
NW.Dom.configure( { LOGERRORS: false, VERBOSITY: false } );
```

#### `registerCombinator( symbol, resolver )`

Registers a new symbol and its matching resolver in the combinators table.

#### `registerOperator( symbol, resolver )`

Registers a new symbol and its matching resolver in the attribute operators table. Example:

```js
NW.Dom.registerOperator( '!=', { p1: '^', p2: '$', p3: 'false' } );
```

#### `registerSelector( name, rexp, func )`

Registers a new selector, with the matching regular expression and the appropriate resolver function, in the selectors table.
