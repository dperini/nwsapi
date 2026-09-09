'use strict'

// Select only the three ESM data exports used by directionality.
// Explicit assignments also declare named exports for Node's CommonJS lexer.
exports.leftToRight =
  require('@unicode/unicode-17.0.0/Bidi_Class/Left_To_Right/regex.mjs').default
exports.rightToLeft =
  require('@unicode/unicode-17.0.0/Bidi_Class/Right_To_Left/regex.mjs').default
exports.arabicLetter =
  require('@unicode/unicode-17.0.0/Bidi_Class/Arabic_Letter/regex.mjs').default
