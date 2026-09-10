// Reviewed syntax beyond the pinned browser stays visible outside native parity.
// Classification is shared by both libraries and never depends on their results.
export const selectorExtensions: Record<
  string,
  { kind: 'standard' | 'draft' | 'library'; specification: string }
> = {
  ':lang("en")': {
    kind: 'standard',
    specification: 'https://drafts.csswg.org/selectors/#lang-pseudo',
  },
  ':lang(en, fr)': {
    kind: 'standard',
    specification: 'https://drafts.csswg.org/selectors/#lang-pseudo',
  },
  '[data-value="A" s]': {
    kind: 'standard',
    specification: 'https://drafts.csswg.org/selectors/#attribute-case',
  },
  ':playing': {
    kind: 'standard',
    specification: 'https://drafts.csswg.org/selectors/#video-state',
  },
  ':paused': {
    kind: 'standard',
    specification: 'https://drafts.csswg.org/selectors/#video-state',
  },
  ':muted': {
    kind: 'standard',
    specification: 'https://drafts.csswg.org/selectors/#sound-state',
  },
  ':current(p)': {
    kind: 'draft',
    specification: 'https://drafts.csswg.org/selectors-5/#the-current-pseudo',
  },
  'col || td': {
    kind: 'draft',
    specification: 'https://drafts.csswg.org/selectors-5/#column-combinator',
  },
  ':heading': {
    kind: 'draft',
    specification: 'https://drafts.csswg.org/selectors-5/#headings',
  },
  ':heading(1)': {
    kind: 'draft',
    specification: 'https://drafts.csswg.org/selectors-5/#headings',
  },
  ':heading(1,4)': {
    kind: 'draft',
    specification: 'https://drafts.csswg.org/selectors-5/#headings',
  },
  ':has-slotted': {
    kind: 'draft',
    specification:
      'https://drafts.csswg.org/css-shadow-1/#the-has-slotted-pseudo',
  },
  'slot:has-slotted': {
    kind: 'draft',
    specification:
      'https://drafts.csswg.org/css-shadow-1/#the-has-slotted-pseudo',
  },
  ':closed': {
    kind: 'library',
    specification: 'https://drafts.csswg.org/selectors/#open-state',
  },
}
