export const jsdomSelectorCases = [
  [3370, '<div class="case" id="hit"></div>', 'div[class=CasE I]', ['hit']],
  [
    3432,
    '<button id="hit">hi</button><input type="submit" id="input">',
    ':is(:is(button, input)[type=submit], button:not([type])):not([disabled])',
    ['hit', 'input'],
  ],
  [3544, '<ul><li id="hit"></li></ul>', 'UL > LI', ['hit']],
  [
    3603,
    '<fieldset disabled><input id="inside"></fieldset><input disabled id="outside"><input id="enabled">',
    'input:disabled',
    ['inside', 'outside'],
  ],
  [3612, '<div class="box" id="hit"></div>', 'DIV.box', ['hit']],
  [
    3686,
    '<div a id="hit"></div><b class="c"></b>',
    ':is([a],b):not(.c)',
    ['hit'],
  ],
  [3750, '<myElement id="hit"></myElement>', 'myElement', ['hit']],
  [
    3780,
    '<p id="hit"></p><x-undefined></x-undefined>',
    'body > :defined',
    ['hit'],
  ],
  [
    3792,
    '<table><tr class="svelte-1ob8zmv"><td class="svelte-1ob8zmv" id="hit"><input class="svelte-1ob8zmv" type="checkbox" checked></td></tr></table>',
    'tr.svelte-1ob8zmv:has(input:where(.svelte-1ob8zmv):checked) td:where(.svelte-1ob8zmv)',
    ['hit'],
  ],
] as const
