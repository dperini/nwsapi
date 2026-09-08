export const queryStateNote =
  'Cold queries run a selector first on a fresh document. Warm queries repeat it.'

export const noteFont = '16px Arial,Helvetica,sans-serif'
export const codeFont = '18px Consolas,Menlo,monospace'
export const noteCodeFont = '16px Consolas,Menlo,monospace'
export const chartColors = [
  ['#baf471', '#2bc5ae'],
  ['#a4aff7', '#ef9bc9'],
  ['#80d7ff', '#739be8'],
]

export const chartTextStyles = `
text{font-family:Arial,Helvetica,sans-serif;fill:#f0f5fa}
.muted{fill:#aabbd0;font:${noteFont}}
.code{font:${codeFont};fill:#dce6f1}
.note .code{font:${noteCodeFont}}
.metadata,.metadata .code{fill:#75808e}
.comparison{font-size:14px;font-variant-numeric:tabular-nums}
.tick{fill:#aabbd0;font-size:12px}
.time{fill:#aabbd0;font-size:13px;font-variant-numeric:tabular-nums}
`

export const chartBackground =
  '<linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101d30"/><stop offset="1" stop-color="#0b1220"/></linearGradient>'

export function chartFrame(height: number) {
  return `<rect width="1100" height="${height}" rx="24" fill="url(#bg)"/><rect x=".5" y=".5" width="1099" height="${height - 1}" rx="24" fill="none" stroke="#2b3a50"/>`
}
