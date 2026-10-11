# Document interface audit and design plan

## Page audit

Reviewed the guide, API reader, and document catalog through the Portless
preview at `https://nwsapi-docs.localhost:1355`. Checked desktop at
1440px, mobile at 390px, light appearance, dark appearance, and reader mode.

| Finding                                                                   | Effect                                                                               | Planned correction                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Header dropdown inherits global `details` padding and summary arrows.     | A small navigation action becomes a large content panel, doubling the header height. | Use the actual Base UI Navigation Menu with shadcn component composition.                |
| Navigation and utilities lack a consistent grouping.                      | The header's controls occupy competing rows on narrow screens.                       | Keep the brand in its own group, with Documents beside language and appearance controls. |
| Catalog repeats the header brand and has no `h1`.                         | Page identity is unclear.                                                            | Restore a single Documents heading and remove the brand eyebrow.                         |
| Reader repeats document metadata beside its document heading.             | The same title is introduced twice.                                                  | Keep the article heading as the sole title.                                              |
| Hidden reader metadata leaves reading time at the left.                   | Alignment changes depending on the document.                                         | Keep reading time at the right, independently of metadata.                               |
| Mobile reader reserves space for a vertical contents rail on both sides.  | The article becomes too narrow for comfortable reading.                              | Place a full-width expandable contents control above the article at 600px and below.     |
| Catalog scroll width is 467px at a 390px viewport.                        | Mobile users can scroll sideways.                                                    | Constrain header, form, and result widths and wrap long titles.                          |
| Search has a large separate Clear button and an oversized enclosing card. | The secondary action competes with search, especially on mobile.                     | Put a small ghost Clear action inside the Input Group and make the form visually quiet.  |
| Catalog results use large rounded cards and generic badges.               | Repeated frames and metadata slow scanning.                                          | Use compact article rows with thin separators and show meaningful metadata.              |
| The first extracted summary may be a generated-file maintenance notice.   | Search results describe repository upkeep instead of document purpose.               | Prefer the first direct prose paragraph to a paragraph nested in a blockquote.           |

The guide already mounts React components for its Radix Select and Checkbox
controls. These components can support a React navigation mount without
changing the article renderer or demonstrations.

## Component audit

| Component                                                                     | Use here                                                        | Design judgment                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Navigation Menu](https://ui.shadcn.com/docs/components/base/navigation-menu) | Global Documents trigger, with links to search, guide, and API. | A compact text trigger and three clear destinations. Keep the full collection in the searchable catalog.                                                                                                  |
| [Breadcrumb](https://ui.shadcn.com/docs/components/base/breadcrumb)           | Reference for location hierarchy.                               | Do not append the current document title to the header and repeat it above the article. The brand already supplies project context.                                                                       |
| [Input Group](https://ui.shadcn.com/docs/components/base/input-group)         | Catalog search with search icon and Clear addon.                | Search remains the largest control, with Clear as a quiet secondary action.                                                                                                                               |
| [Field](https://ui.shadcn.com/docs/components/base/field)                     | Search, Topic, and Type labels and grouping.                    | Keep persistent labels and associated controls.                                                                                                                                                           |
| [Select](https://ui.shadcn.com/docs/components/base/select)                   | Topic and Type filters.                                         | Reuse the existing shadcn Select adaptation so the forms belong to the same interface.                                                                                                                    |
| [Button](https://ui.shadcn.com/docs/components/base/button)                   | Ghost Clear action in the search input.                         | Use the component's secondary visual hierarchy.                                                                                                                                                           |
| Card, Command, Dialog, Sidebar                                                | Reviewed as possible alternatives.                              | A full-page document list already supports direct browsing and search. Extra cards or a second search overlay would add competing navigation. Preserve the existing section contents behavior on desktop. |

Official Base UI behavior is documented at
[Navigation Menu](https://base-ui.com/react/components/navigation-menu).
Use Root, List, Item, Trigger, Content, Link, Portal, Positioner, Popup, and
Viewport. Keyboard handling, dismissal, focus, and positioning belong to
the component.

The `shadcn` CLI documentation command was blocked by the package manager's
trust policy on `semver@6.3.1`. Official registry component sources were
retrieved for manual installation. Preserve their composition in `.mts`
React components using `createElement`, and map their semantic styles to
the guide's existing theme variables. Pin `@base-ui/react` in the workspace
catalog and install with the repository's pinned package manager.

## Design specification

- Use Inter for navigation and prose, with JetBrains Mono for code.
- Use existing foreground, muted text, surface, border, and accent tokens
  in light, dark, and reader appearances. No independent palette.
- Use a 34px to 36px navigation trigger, matching the utility controls.
  The resting trigger has a transparent surface and no large border box.
- Keep the desktop header close to its original 80px height. On narrow
  screens allow two compact rows, with navigation and utilities aligned.
- Keep Documents alongside the language and appearance controls. Use a restrained chevron and
  avoid repeating a document icon beside the label.
- Limit the menu to three destinations: Browse and search documents,
  Interactive guide, and API reference. Use plain links with modest hover
  surfaces, a thin border, and a small radius. Keep the popup inside the
  viewport. Provide accessible focus feedback and Escape dismissal.
- Catalog: one `h1`, a short muted introduction, search, filters, result
  count, and list. Use an 8px to 10px radius on controls and overlays.
  Result titles use the existing ink color and a restrained link treatment.
- Preserve URL query/filter state, deep document and section links,
  locale switching, reading controls, narration, and quiz behavior.
- Keep the reading-time calculation unchanged and its display right-aligned.
- At mobile widths, use 16px article side margins and a labelled contents
  disclosure above the reading column. Hide the compact vertical tabs there.

## Implementation ownership and review

1. Luna low: shared navigation components, component styles, three header
   integrations, shared locale initialization, navigation translations, and
   pinned dependency setup.
2. Luna low: catalog form components, search/filter integration, catalog
   hierarchy, result styling, summary extraction, and mobile overflow.
3. Luna low: reader title/metadata cleanup, reading-time alignment, and
   mobile contents/article layout.

Review the combined implementation in the browser at desktop and mobile
sizes in all three appearances. Check menu click, keyboard opening, Escape,
outside dismissal, destinations, catalog search/filters/reset, query state,
localization, and duplicate headings. Rebuild the static preview. Record
remaining limitations rather than inferring that compilation proves layout.

## Verification outcomes

- Implemented by three Luna agents at low reasoning effort after the page
  and component audits.
- Checked the catalog, API reader, and interactive guide at 1440px and
  390px in light, dark, and reader appearances. Each page has one `h1` and
  no horizontal overflow. No browser exceptions or failed asset responses
  occurred in these checks.
- Checked keyboard opening, Escape, outside dismissal, search, topic
  filters, reset, URL state, and Italian localization.
- Confirmed the mobile reader has 16px side margins and the reading time
  remains right-aligned. Reader mode preserves the audio controls and
  flexible scrubber width. The matching-card quiz returns the expected
  explanation through its visible Select and Check controls.
- Rebuilt the static preview and checked the modified source with
  TypeScript and Oxlint. The build emits the existing dependency-level
  `use client` directive warnings.
- The user subsequently requested Documents beside the appearance icons.
  The header grouping follows that correction rather than the initial
  placement beside the brand.
- The navigation trigger was subsequently shortened to a stacked-document
  icon and downward chevron. Its accessible label and tooltip are “Docs”
  in English, with the localized label preserved in Italian.
- Header icons share the same semantic foreground and interaction colors,
  with matching visible stroke weights. The top document lifts, straightens,
  and settles onto the stack on interaction. Reader mode and reduced-motion
  preferences are preserved.

These checks cover representative interfaces and interactions. They do not
establish the accuracy of every cataloged document or narration recording.

## Responsive and accessibility review: October 9, 2026

The follow-up review used native Chrome for the desktop, tablet, and mobile
tour, with isolated Chromium checks for repeatable adverse conditions. The
review applied Google's [modern web guidance](https://github.com/GoogleChrome/modern-web-guidance)
on responsive layouts, semantic controls, keyboard focus, reduced motion,
and early rendering. Interface text follows the [developer documentation
tone guidance](https://developers.google.com/style/tone): concise instructions,
clear destinations, and familiar terms.

| Finding                                                       | Correction                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every header called its page Model Guide.                     | The breadcrumb uses the rendered document title. The catalog uses Docs and the interactive walkthrough uses Model Guide.                               |
| Mobile utilities were aligned to the right.                   | The control row starts at the left at 600px and below. The breadcrumb remains a contiguous group.                                                      |
| The reader's tablet contents rail opened abruptly at 901px.   | Initial disclosure behavior shares the 1200px breakpoint used by the walkthrough.                                                                      |
| Contents navigation could leave focus on a closed disclosure. | Links focus their destination headings and open containing details for fragment navigation.                                                            |
| Generic table regions repeated landmark names.                | Tables have contextual captions and header scopes. Only overflowing tables become named, keyboard-accessible scroll regions.                           |
| Reader progress ignored reduced-motion preferences.           | Scroll-driven animation is limited to users without a reduced-motion preference.                                                                       |
| The estimate occupied a separate row above the card.          | Reading time sits beside the article title. Catalog and navigation controls have no estimate. The calculation remains rounded-up words divided by 220. |
| The initial reader showed an empty loading card.              | The pending article area stays plain, with an accessible loading status.                                                                               |
| Catalog controls appeared only after JavaScript loaded.       | Native controls render with the page and preserve text entered before enhancement.                                                                     |
| A failed indexed document could interrupt the collection.     | Successful documents remain searchable, with a retry action for failed entries.                                                                        |

The final viewport sweep covers the walkthrough, document catalog, and API
reader at 320px, 375px, 390px, 600px, 768px, 1024px, 1440px, and 1920px in
light, dark, and reader appearances: 72 combinations. After layout settled,
the sweep found one page title per page, no document-level horizontal
overflow, and no browser exceptions. Nine automated accessibility scans
at 375px reported no violations for the selected WCAG A/AA and best-practice
rules. These scans supplement keyboard and native-browser checks. They do
not replace a full assistive-technology evaluation.

Long document titles wrap within the article header. A separate check with
text enlarged to twice the default size preserved the title and estimate
without overlap or page overflow. Reading width is capped at 80ch. Code and
wide tables retain their local scrolling behavior.

Keyboard checks covered the skip link, destination focus, Docs menu opening
and dismissal, visible labels focusing enhanced Select controls, and Italian
accessible names. Saved appearance restored before modules loaded in light,
dark, and reader modes. With JavaScript disabled, direct document links
remain available and inactive appearance controls are hidden. Reduced-motion
checks disabled the paper animation and reading progress animation. Forced
colors retained visible focus outlines.

Opening every API disclosure at 390px exposed an additional column-sizing
defect. Constraining the mobile reading column fixed the page overflow while
preserving local table scrolling. The expanded reader and walkthrough also
passed the selected automated accessibility rules. A stalled reader import
showed a plain pending area, and an aborted import produced a visible error.

Delayed catalog loading preserved a typed query through enhancement. Enter
did not reload the page before or after enhancement. Search, Clear, and
browser history remained usable while indexing. Simulated single-document
failures left 94 results available and recovered to 95 through Retry in
development and in the built preview. Retry fetches fresh source instead of
repeating a cached failed module import. Built HTML reports retain separate
pristine source assets because their public report URLs redirect to the
reader. Forced-cold development loads produced no browser or network errors.

The mobile contents interaction was subsequently changed at the user's
request. At 600px and below, expanding contents replaces the article area.
Closing it or choosing a section restores the article. The expanded list
uses its full height instead of a capped panel above the article.
The reader's initial breadcrumb suffix is empty. Its separator and document
title become visible together after loading, avoiding a temporary Docs label.

The mobile header was then compacted. The contents hamburger precedes the
utility icons, distributed across the full row, with no header divider.
The separate collapsed contents card is removed. The header control keeps
its expanded state synchronized with the contents view.

## Compact reader follow-up

The accepted mobile header uses one row. The breadcrumb and a small raised
GitHub source link sit on the left, followed by contents, Docs, language,
reading mode, and appearance controls. The source glyph is 14px with 2px of
clearance above its external arrow. Its mobile target is 24px by 34px.
The article fills the mobile width with 16px text padding. Its outer border
and rounded corners are removed. Article focus marks the title rather than
outlining the whole content area.

A fresh sweep of the guide, catalog, and API reader covered eight widths
from 320px to 1920px in light, dark, and reader appearances. All 72 settled
states had one main heading, no horizontal overflow, and no browser
exceptions. Nine accessibility scans found no violations in the selected
WCAG A/AA and best-practice rules. These automated results do not replace
assistive technology testing.

The catalog was also checked with search, Enter, keyboard Clear, category
selection, browser back, and Italian labels. Its 95-document collection
loaded successfully. API, long prose, and a benchmark report were checked
with mobile contents takeover, Escape, section selection, direct links,
Skip to document, and expanded disclosures.

Reader section jumps now leave 24px above a mobile heading instead of
combining the guide's 90px scroll padding with that heading margin. The quiz
Select retains the native control's description relationship, so its help
and feedback are associated with the enhanced trigger. Its Check interaction
was exercised through the visible controls after this change.

The follow-up found a 50px header shift at 601px when a long title loaded.
Keeping the reader identity flexible and the actions fixed removes that
shift. The header now measures 81px both before and after title loading at
601px. At normal mobile text sizes, the accepted single row remains 58px.
If enlarged text leaves less than one text em for the breadcrumb title,
the controls reflow onto a second row. Checks at 200% text size confirmed
readable title space and no overflow at 320px and 390px. Restoring text size
returns the header to one row without an observer loop.

The dynamic reader breadcrumb now uses the rendered article title without
passing through the general text translator. This keeps the breadcrumb,
tooltip, and main title consistent for the beginner guide, whose English
content has an Italian translation notice. The interface and GitHub source
label still localize.

## Desktop reading and discovery follow-up

The desktop breadcrumb now uses tighter spacing around its separator. Its
GitHub mark is 16px with a 7px arrow overlapping the upper corner. The compact
header retains a 14px mark with a separate 8px arrow, preserving the readable
small silhouette and its existing target. The Docs icon briefly shows two
extra sheets during a staggered shuffle. Both extra sheets become invisible
at rest, leaving the two-page mark. Reduced motion disables the shuffle.

Search results highlight literal matches in their titles, summaries, and
excerpts. Highlighting creates text nodes and mark elements, so query text
cannot become markup. Metadata and related links retain their regular style.
The selector optimization plan has a reviewed purpose summary under
Implementation instead of displaying its internal task status as the
discovery summary. Plans share that type rather than adding a separate
Implementation plan filter.

Article link arrows stay with their final word instead of wrapping onto a
separate line. Long identifiers retain their wrapping behavior. Reading
progress uses direct updates when reduced motion is enabled. Its section
tracking also updates when article disclosures or loaded content change the
article's size.

Printing opens closed article disclosures and restores their previous state
afterward. PDF checks confirmed that the API configuration details and report
methodology appear even when those sections were closed on screen. A mixture
of initially open and closed sections returned to the same state after
printing. These checks cover Chromium printing rather than every browser's
print engine.

The GitHub source link now has no rounded hover surface or visible border.
It retains its link semantics and keyboard focus outline. The Docs sheets
have opaque theme-colored fills and visible outlines. Its initial fallback
uses the same two-page shapes. The contents title and hamburger use static
focus indicators without shimmer. Collapsing the reader contents allows the
article to grow from an 80ch cap to 104ch. At 1440px, the API article expanded
from about 825px to 1181px in all three appearances without page overflow.

The catalog's canonical route is now `index.html`, with `all` as its breadcrumb.
The previous catalog URLs redirect to it while preserving the query and fragment.
Category pills sit above each result title, and metadata no longer repeats
the category. Clear applies to the search field and preserves topic and type
filters. It is disabled while that field is empty. The attribute equality
regression result describes the documented test scope instead of showing its
runtime instruction as the summary.

The Portless preview uses `https://nwsapi-docs.localhost:1355/index.html`.
The root Portless configuration starts the guide under that name and opens
the catalog. Type labels use Doc, Results, and Walkthrough while retaining
their existing filter values for saved URLs. The Docs menu orders API,
Walkthrough, and All docs.

The paper shuffle starts after the Docs popup finishes closing. Opening or
focusing the menu leaves the sheets still, and reopening cancels a shuffle.
Keyboard and outside-click dismissal both return the mark to two sheets.
Reduced motion and reader mode suppress this animation. The Docs trigger
uses the other header buttons' 1.5px inset focus ring. Tab checks at 320px,
390px, and 1440px reached every header icon control on the catalog and reader.

Category pills use the existing theme palette: blue for repository docs,
purple for performance, teal for testing, orange for shared guidance, and
slate for the project overview. Their labels preserve the category without
relying on color. Contrast checks cover all five categories in light, dark,
and reader modes, with no WCAG AA violations in the catalog scans.

Choosing a contents link keeps that section selected through the scroll and
at the bottom of the page. Manual wheel, touch, scrollbar, and scrolling-key
input resumes position tracking. Fragment navigation and initial deep links
also select their target. Click and Enter checks cover the reader and guide
at 390px and 1440px with normal and reduced motion.

Code links keep their label and arrow in an inline flex group. Long labels
can wrap within that group without placing the arrow on a separate row.
Copy controls and the contents title use muted colors at rest and their
section accent on hover or keyboard focus. All contents shimmer is removed,
including the active link, while static focus and selection indicators remain.

The catalog form has no outer focus outline. Its skip link focuses the search
input directly, and the field and filter controls retain their own focus
indicators. Keyboard focus, Clear state, and accessibility checks passed in
light, dark, and reader modes.
