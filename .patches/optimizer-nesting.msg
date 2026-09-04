Read the last token of a selector that ends in a nested pseudo-class

Before testing candidates, collect() asks reOptimizer for the last simple token of a selector and uses it to fetch the candidates by tag, class or id. The parenthesized part of that pattern is '\x28[^\x29]+(?:\x29|$)', which stops at the first ')', so a final compound holding a nested functional pseudo-class does not match at all — and a selector the optimizer cannot read is answered by walking every element in the context.
 'div:not(:nth-of-type(2n))' therefore tests every element in the document instead of the divs, and since ':not()' evaluates its argument through s.match() per element, each of those elements resolves nth-of-type. On a 6300-element page that is 6344 resolutions building 3911 sibling caches over 196312 steps, for a selector whose subject is a div.
 The parenthesized part now tolerates two levels of nesting, which reaches ':not(:not(:not(span)))'. Deeper than that falls back to the unoptimized scan, as before. Both the old and new patterns stay linear on unbalanced input: 3200 unclosed parentheses match in 0.02ms.
 div:not(:nth-of-type(2n)) 45.62ms -> 134.92us 338x div:not(:nth-child(3)) 9.42ms -> 123.94us 76x div:is(.example):not(:where(.x)) 2.65ms -> 39.45us 67x div:not(.x) 27.93us -> 27.75us -
 Results are unchanged; the four above agree with the native engine.
