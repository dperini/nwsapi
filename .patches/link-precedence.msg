Anchor the alternation in the :link and :placeholder-shown tests

/^a|area$/ alternates '^a' with 'area$' rather than anchoring an alternation, so it accepts any element whose name begins with 'a'. ':link' and ':any-link' therefore match <abbr href="...">, where browsers match only <a> and <area>. It agrees with browsers on those two, which is why the test suites do not catch it.
 /^input|textarea$/ in ':placeholder-shown' has the same shape; there the surrounding conditions happen to mask it.
 The link test is hoisted into a helper at the same time, so the three places that need it share one definition.
