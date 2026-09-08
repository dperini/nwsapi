# Project history and name

`nwmatcher` began as Diego Perini's CSS selector engine for browser libraries. Its work continued in `nwsapi`, connecting nearly two decades of development across browser frameworks, `jsdom`, and the npm ecosystem.

## The NWBOX connection

The original [Javascript @ NWBOX site](http://javascript.nwbox.com/) lists NWMatcher alongside NWEvents and NWFrames. The [company site](http://nwbox.com/) identifies NWBOX in Verona, Italy. The [early `nwmatcher` source](https://github.com/dperini/nwmatcher/blob/5ba75cc29a2106bf6ad3b5d0a72d0121ba3340fa/src/nwmatcher.js) uses the `NW.Dom` namespace and links to NWBOX for its download and license. That namespace survives in `nwsapi`.

These sources suggest that the name combines the NWBOX project prefix with “Matcher,” describing its job of matching elements against CSS selectors. This is an inference from the shared branding and code. The sources do not explicitly expand “NW.”

## Recorded milestones

| Date              | Milestone                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| July 22, 2007     | The [early source header](https://github.com/dperini/nwmatcher/blob/5ba75cc29a2106bf6ad3b5d0a72d0121ba3340fa/src/nwmatcher.js) records the creation of `nwmatcher`. |
| July 15, 2008     | The surviving [`nwmatcher` Git history begins](https://github.com/dperini/nwmatcher/commit/3d1641030b0e62cd7aeab2ce6c0deb0169b3f5d4).                               |
| September 7, 2008 | A [release preparation commit](https://github.com/dperini/nwmatcher/commit/b0200ba7e546a0428d59553ad22c6e676248dea8) updates the version strings to 1.0.            |
| October 2012      | [`jsdom` adopts `nwmatcher`](https://github.com/jsdom/jsdom/commit/e4ae05534f30965304b2710638ca350ef5b320af) to replace `sizzle`.                                   |
| June 2017         | `nwsapi` starts in a separate repository with an [import of `nwmatcher` 1.4.0](https://github.com/dperini/nwsapi/commit/5bcb545c4de781ad7f57dbc485c39c892ccbecb2).  |
| May 2018          | [`jsdom` moves from `nwmatcher` to `nwsapi`](https://github.com/jsdom/jsdom/commit/38b868b0ca2a127a55c8a59a0e1320e032074118).                                       |

The source header records development before the surviving Git history begins.

## Why selector engines mattered

Engines such as `nwmatcher` and [`sizzle`](https://github.com/jquery/sizzle) helped libraries provide consistent element queries across browsers. Correct results, browser compatibility, and speed all mattered when applications relied on selectors to find and update page content.

Perini's [original project page](http://javascript.nwbox.com/NWMatcher/) explains a specific need: checking whether one element matched a selector without first finding every matching element in the document. This supported event delegation, where a listener checks whether an event's target matches a rule. The companion [NWEvents project](http://javascript.nwbox.com/NWEvents/) used `nwmatcher` for this purpose, including for elements added after a listener was registered.

John-David Dalton championed `nwmatcher` in FuseJS and Prototype. [FuseJS made it the default selector engine](https://github.com/jgornick/fusejs/blob/aaae8cb4f370be3bb1bbc93cb5ce51a8e8f56d77/README.md), and [Prototype 1.7 supported it as a replacement for `sizzle`](https://github.com/prototypejs/prototype/blob/1.7/Rakefile). Dalton [improved the Prototype adapter](https://github.com/prototypejs/prototype/commit/2f9bde3ad5a2e3dd104c812b6c81f4077fe0aa1e) and discussed selector engines and performance at [JSConf.US 2010](https://2010.jsconf.us/speakers.html).

## Adoption in `jsdom` and continuation in `nwsapi`

Adoption by `jsdom` brought `nwmatcher` into Node.js programs using browser-style DOM APIs. The [integration](https://github.com/jsdom/jsdom/commit/e4ae05534f30965304b2710638ca350ef5b320af) used its `first()` and `select()` methods to implement `querySelector()` and `querySelectorAll()` on documents and elements.

`nwsapi` continued that work with newer selector features. Its first additions included [`:matches()`](https://github.com/dperini/nwsapi/commit/8152d792aa63381348e1da9bb43519157facacdd) and the [attribute case-insensitive flag](https://github.com/dperini/nwsapi/commit/a376f7a565be80867790c169bea64e588f52abdf). The later [`jsdom` adoption commit](https://github.com/jsdom/jsdom/commit/38b868b0ca2a127a55c8a59a0e1320e032074118) cited fixes for known issues, support for more selectors, and faster execution.

Today, `nwsapi` receives nearly 50 million npm downloads a week. [npm download statistics](https://api.npmjs.org/downloads/point/2026-08-25:2026-08-31/nwsapi)

## Related work on DOM readiness

Perini also helped libraries detect when a document was ready to use, before images and other resources finished loading. His [DOMComplete experiments](http://javascript.nwbox.com/DOMComplete/) began in 2006. The [IEContentLoaded page](http://javascript.nwbox.com/IEContentLoaded/) documents his `doScroll()` technique for older Internet Explorer versions, which lacked the `DOMContentLoaded` event available in other browsers.

Libraries including `jquery` and MooTools adopted the technique. The [MooTools 1.6.0 source](https://github.com/mootools/mootools-core/blob/1.6.0/Source/Utilities/DOMReady.js#L54) still credits Perini beside its readiness check. This related NWBOX work helped libraries provide dependable startup behavior when differences between browsers required careful tests and fallbacks.

See the [compatibility review](selector/compatibility.md) for current selector behavior and the [performance journal](perf/journal.md) for measured implementation changes.
