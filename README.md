# NWSAPI

Fast CSS Selectors API Engine

[![npm version](https://img.shields.io/npm/v/nwsapi.svg?style=flat-square)](https://www.npmjs.com/package/nwsapi)
[![npm downloads](https://img.shields.io/npm/dm/nwsapi.svg?style=flat-square)](https://www.npmjs.com/package/nwsapi)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=flat-square&logo=github)](https://github.com/sponsors/dperini)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-yellow?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/dperini)

NWSAPI is the development progress of NWMATCHER aiming at Selectors Level 4 conformance. It has been completely reworked to be easily extended and maintained. It is a right-to-left selector parser and compiler written in pure Javascript with no external dependencies. It was initially thought as a cross browser library to improve event delegation and web page scraping in various frameworks but it has become a popular replacement of the native CSS selection and matching functionality in newer browsers and headless environments.

It uses regular expressions to parse CSS selector strings and metaprogramming to transform these selector strings into Javascript function resolvers. This process is executed only once for each selector string allowing memoization of the function resolvers and achieving unmatched performance.

---

## Installation

To include NWSAPI in a standard web page:

```html
<script type="text/javascript" src="nwsapi.js"></script>
