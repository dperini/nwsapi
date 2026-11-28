# Native DOM string code units

The additive `*_utf16` and `*_units` methods keep original UTF-16 units in the
native Tree. Text, comments, processing-instruction data, attributes, element
names, namespaces and doctype fields distinguish lone high surrogates, lone low
surrogates and U+FFFD. Normal scalar strings retain compact storage; a non-scalar
payload owns its original unit buffer. Existing `&str`/`String` getters and
`AttributeData` remain compatibility views. Bindings that require DOM string
behavior must use the unit getters and `AttributeDataUtf16`.

Mutation drains expose exact old values, local names and namespaces through
`Utf16MutationEvent`. Import/clone/adoption can use the complete unit attribute
records and name/namespace methods. Collection charges unit payloads, identity
keys and pending mutation buffers before committing; failure leaves the Tree
unchanged and handles are never reused.

`Tree::parse_utf16`, `set_inner_html_utf16` and `insert_adjacent_html_utf16` accept
DOM string units. Scalar inputs without U+FEFF use the existing parser. Inputs
with lone units or U+FEFF use the license-preserved html5ever 0.39 tokenizer adaptation and its
public tree builder. A temporary scalar escape transport doubles literal markers
and decoded numeric marker references; lone-unit encodings are injective and
cannot alias source markers or numeric entities. Native nodes immediately decode
this transport into native unit-backed payloads. It is never exposed to guest JS.
Fragment contexts carry actual SVG/MathML namespaces and integration-point
attributes through the public tree builder, including adjacent insertion. Both
scalar and original-unit fragment paths preserve DOM-string BOMs.
The parser retains grammar, rawtext/RCDATA, foreign-content and foster-parenting
behavior, preserves template-content fragments, and retains U+FEFF wherever
it appears in a DOM string. The adaptation preserves upstream tokenizer tests
and source hashes. Parser projection/import, text aggregation and serialization
use explicit heap stacks; deep trees do not consume the host call stack.

Original-unit selector entry points parse into native records without caching
under lossy strings. CSS identifiers and hexadecimal surrogate escapes use
replacement-character behavior; raw quoted attribute strings keep original units.
Scalar selectors retain the existing bounded caches. Structural type comparisons
and ID lookup also distinguish original names and values. ID/class and
unqualified CSS attribute selectors read null-namespace attributes; ordinary
`getAttribute` retains its first-qualified-name behavior.

Chrome controls cover these DOM seams. They do not establish complete browser
API parity, XML parsing, resource lifecycles or JavaScript engine/source behavior.
Those are consumer capabilities and must be tested in the consuming runtime.
