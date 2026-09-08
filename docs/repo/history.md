# Project history and name

`nwsapi` continues the selector-engine work that Diego Perini began with `nwmatcher`. The surviving `nwmatcher` Git history starts on July 15, 2008. By September 2026, that history spans more than 18 years and approaches two decades.

## The NWBOX connection

The original [Javascript @ NWBOX site](http://javascript.nwbox.com/) lists NWMatcher, NWEvents, and NWFrames together. It describes NWMatcher as a CSS3 selector and matcher engine. These projects share the `NW` prefix. The [NWBOX company site](http://nwbox.com/) identifies NWBOX S.a.s. in Verona, Italy, and describes its computer security and web software services.

The [early `nwmatcher` source](https://github.com/dperini/nwmatcher/blob/5ba75cc29a2106bf6ad3b5d0a72d0121ba3340fa/src/nwmatcher.js) uses the `NW.Dom` namespace and links to `javascript.nwbox.com/NWMatcher/` for its download and license. The namespace survives in `nwsapi` today.

Together, these sources suggest that the name combines the NWBOX project prefix with “Matcher,” describing the engine's job of matching elements against CSS selectors. This is an inference from the shared branding and code. The reviewed sources do not explicitly expand the letters “NW” or explain how NWBOX itself was named.

## From `nwmatcher` to `nwsapi`

| Date              | Recorded milestone                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| July 22, 2007     | The early `nwmatcher` source header records this creation date. It predates the surviving Git history.                                                                                                                                        |
| July 15, 2008     | Diego Perini makes the [first `nwmatcher` Git commit](https://github.com/dperini/nwmatcher/commit/3d1641030b0e62cd7aeab2ce6c0deb0169b3f5d4), containing an empty README. Source code appears in the next commit. The date is recorded in UTC. |
| September 7, 2008 | A [release preparation commit](https://github.com/dperini/nwmatcher/commit/b0200ba7e546a0428d59553ad22c6e676248dea8) updates the version strings to 1.0.                                                                                      |
| June 4, 2017      | The separate `nwsapi` repository receives its [initial commit](https://github.com/dperini/nwsapi/commit/b3dcaf6a1b31c6f272caa4986f941a2c6c97011a).                                                                                            |
| June 5, 2017      | The [first source import](https://github.com/dperini/nwsapi/commit/5bcb545c4de781ad7f57dbc485c39c892ccbecb2) brings in `nwmatcher` 1.4.0. Further commits that day add Selectors Level 4 features.                                            |

The 2007 date comes from a source comment. The 2008 date comes from Git history. They describe different records, so the first Git commit should not be presented as the first day of development.

The 2017 work established `nwsapi` as a successor in a separate repository. Its early additions included [`:matches()`](https://github.com/dperini/nwsapi/commit/8152d792aa63381348e1da9bb43519157facacdd), [form-state pseudo-classes](https://github.com/dperini/nwsapi/commit/9e598d4a62950bca314e8ad63a32c136c6faeb1a), and the [attribute case-insensitive flag](https://github.com/dperini/nwsapi/commit/a376f7a565be80867790c169bea64e588f52abdf). Those commits show how the project extended the earlier engine toward newer selector specifications.

## Why selector engines mattered

Selector engines helped libraries offer predictable element queries while browser implementations differed. Engines such as `nwmatcher` and [`sizzle`](https://github.com/jquery/sizzle) handled the work behind selector-based library APIs. Their value depended on correct results, browser coverage, and execution cost.

Perini's [original project page](http://javascript.nwbox.com/NWMatcher/) explains a specific need: testing whether one element matched a selector without first finding every matching element in the document. That made `nwmatcher` useful for event delegation. A listener could check whether an event's target matched a rule, including elements added after the listener was registered. The companion [NWEvents project](http://javascript.nwbox.com/NWEvents/) used the engine for this purpose.

## FuseJS and Prototype

John-David Dalton's work with FuseJS and Prototype helped make `nwmatcher` usable behind familiar framework APIs. FuseJS was his main framework effort. Its preserved [README](https://github.com/jgornick/fusejs/blob/aaae8cb4f370be3bb1bbc93cb5ce51a8e8f56d77/README.md) identifies `nwmatcher` as the default among eight supported selector engines, alongside alternatives such as `sizzle` and Slick. Its [adapter](https://github.com/jgornick/fusejs/blob/14a0ed50887007287188a71d51e70b609d540146/src/dom/selector/nwmatcher.js) calls `NW.Dom.match()` and `NW.Dom.select()`. A [January 2010 commit](https://github.com/jgornick/fusejs/commit/c0ff1d17de41a6f31896901331c4cfcd4d5b70bb) records his adapter update for `nwmatcher` 1.2.1.

Prototype also allowed its selector engine to be swapped for `nwmatcher`. The [Prototype 1.7 build](https://github.com/prototypejs/prototype/blob/1.7/Rakefile) selected engines through `SELECTOR_ENGINE`, with `sizzle` as its default. Its [`nwmatcher` adapter](https://github.com/prototypejs/prototype/blob/1.7/vendor/nwmatcher/selector_engine.js) connected selection and matching to `Prototype.Selector`. Dalton's [April 6, 2010 commit](https://github.com/prototypejs/prototype/commit/2f9bde3ad5a2e3dd104c812b6c81f4077fe0aa1e) simplified that adapter and optimized it for browsers that did not need Prototype's element extensions.

The preserved repository also contains Prototype history. Its [`1.6.0.2` tag](https://github.com/jgornick/fusejs/releases/tag/1.6.0.2), created by Dalton on August 26, 2008, points to a January 25, 2008 commit preparing a Prototype release. The [README at that tag](https://github.com/jgornick/fusejs/blob/1.6.0.2/README) identifies Prototype. This records an earlier part of the repository's lineage, rather than a FuseJS release with that version.

The [JSConf.US 2010 program](https://2010.jsconf.us/speakers.html) lists Dalton's talk, “All you can leet - Coding for performance, CSS engines, and sandboxed natives.” Its description emphasizes feature testing, avoiding repeated work, and choosing selector engines for consistent results, specification behavior, and the browsers a project needs. Dalton recalls promoting `nwmatcher` in that talk. The program confirms its subject, while the specific recommendation is his recollection recorded during this history review in September 2026.

FuseJS combined its selector support with sandboxed natives. Dalton later applied sandboxed arrays to a proposed collection API in his [`nodelist` experiment](https://github.com/jdalton/nodelist/blob/07635c6d750ba6b405117e1ac91bb176770c19c8/README.md).

## Making the DOM ready across browsers

Perini's contribution also reached the startup code of major libraries. Scripts needed to know when the document was ready to inspect and change. Waiting for the window's `load` event could delay that work until images and other resources had loaded. Older Internet Explorer versions needed an alternative to the `DOMContentLoaded` event available elsewhere.

The [DOMComplete test page](http://javascript.nwbox.com/DOMComplete/) says it was first published on July 31, 2006. It demonstrates attaching behavior before images finish loading, including a server response with deliberate delays. Its change notes record the move to `doScroll()` for Internet Explorer and identify earlier checks that were unreliable. This related NWBOX work reaches back 20 years as of 2026. It does not change the later dates recorded for `nwmatcher` itself.

The [IEContentLoaded page](http://javascript.nwbox.com/IEContentLoaded/) documents his `doScroll()` technique. A small polling loop tried the method until it stopped throwing, using that change to detect document readiness. A readiness-state fallback and a guard ensured that the callback ran once. Its tests checked that images did not determine when DOM initialization could begin.

This became practical infrastructure for other libraries. [`jquery` 1.4.2](https://github.com/jquery/jquery/blob/1.4.2/src/core.js#L741-L758) explicitly credits Diego Perini and links to IEContentLoaded. [MooTools 1.2.5](https://github.com/mootools/mootools-core/blob/1.2.5/Source/Utilities/DomReady.js) also credits him beside its `doScroll()` check. These are direct examples of libraries adapting the technique into their own readiness code.

That work helped establish dependable JavaScript libraries when scripting across browsers required careful experiments and fallbacks. The historical NWBOX pages preserve both the techniques and the tests behind them.

This page describes the project's origins. See the [compatibility review](selector/compatibility.md) for current selector behavior and the [performance journal](perf/journal.md) for measured implementation changes.
