Every built-in element is :defined

':defined' asks the custom element registry about the candidate's tag name and requires an instanceof match, so it matches upgraded custom elements and nothing else. Every built-in element is defined; only a custom element can be undefined, and only until a definition exists and it has been upgraded. Browsers read it off the element's custom element state, where uncustomized and custom are the two that count as defined. https://github.com/chromium/chromium/blob/155.0.8041.1/third_party/blink/renderer/core/dom/element.h#L1201
 The test reads the hyphen in the name first, which is what makes a name a custom element name, and asks for the 'is' attribute only when there is none, so an ordinary element costs one string scan.
