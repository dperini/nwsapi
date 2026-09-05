const cases = []
for (const quote of ['"', "'"]) {
  for (const newline of ['\n', '\r', '\r\n', '\f']) {
    const suffix = JSON.stringify({ quote, newline })
    for (const [name, raw, value] of [
      ['middle continuation', 'x\\' + newline + 'y', 'xy'],
      ['hex boundary', '\\7\\' + newline + '8', '\x078'],
      ['hex newline terminator', '\\78' + newline + 'y', 'xy'],
      ['six-digit hex boundary', '\\000078\\' + newline + '9', 'x9'],
      [
        'escaped quote',
        'x\\' + quote + '\\' + newline + 'y',
        'x' + quote + 'y',
      ],
      ['literal backslash', 'x' + '\\'.repeat(3) + newline + 'y', 'x\\y'],
      ['consecutive continuations', '\\' + newline + 'x\\' + newline, 'x'],
    ]) {
      cases.push({
        name: name + ': ' + suffix,
        value,
        selector: 'div[data-x=' + quote + raw + quote + ']',
      })
    }
    cases.push({
      name: 'EOF after continuation: ' + suffix,
      value: 'x',
      selector: 'div[data-x=' + quote + 'x\\' + newline,
    })
    cases.push({
      name: 'EOF preserves string space: ' + suffix,
      value: 'x ',
      selector: 'div[data-x=' + quote + 'x\\' + newline + ' ',
    })
    cases.push({
      name: 'EOF after final backslash: ' + suffix,
      value: 'x',
      selector: 'div[data-x=' + quote + 'x\\' + newline + '\\',
    })
    cases.push({
      name: 'raw newline at EOF is invalid: ' + suffix,
      value: 'x',
      valid: false,
      selector: 'div[data-x=' + quote + 'x' + newline,
    })
    for (const operator of ['~=', '|=', '^=', '$=', '*=']) {
      cases.push({
        name: 'hex continuation with ' + operator + ': ' + suffix,
        value: 'x',
        selector:
          'div[data-x' + operator + quote + '\\78\\' + newline + quote + ']',
      })
    }
    cases.push({
      name: 'even backslashes do not escape newline: ' + suffix,
      value: 'x\\y',
      valid: false,
      selector:
        'div[data-x=' +
        quote +
        'x' +
        '\\'.repeat(2) +
        newline +
        'y' +
        quote +
        ']',
    })
  }
}
export default cases
