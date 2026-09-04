/*
 * The SVG charts, following docs/design/repo/charts.md in socket-wheelhouse: a
 * blue-black canvas, a hairline grid, and the violet -> pink -> blue gradient
 * carrying the series color, with a soft halo rather than a hard glow.
 *
 * Grouped horizontal bars: one row per case, one bar per series. Horizontal
 * because selector text is long and a rotated label is hard to read. The axis
 * is logarithmic because these timings span three orders of magnitude and on a
 * linear axis every bar but the worst one disappears.
 */

export const INK = {
  canvas: '#0b0b12',
  grid: 'rgba(255,255,255,0.075)',
  text: '#e7e5f2',
  muted: 'rgba(231,229,242,0.62)',
  series: ['#a98bff', '#f05abe', '#358ff3'],
};

export function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function defs() {
  return `  <defs>
    ${INK.series.map((color, i) => `<linearGradient id="bar-${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.55"/>
    </linearGradient>`).join('\n    ')}
    <filter id="halo" x="-50%" y="-50%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="halo"/>
      <feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

// Grouped horizontal bars: one row per case, one bar per engine. Horizontal
// because selector text is long and a rotated label is hard to read.
export function chart({ title, subtitle, rows, seriesNames, footer }) {
  const padTop = 118, padLeft = 300, padRight = 110, rowHeight = 26, groupGap = 16;
  const barHeight = Math.floor((rowHeight - 6) / seriesNames.length);
  const plotWidth = 600;
  const height = padTop + rows.length * (rowHeight + groupGap) + 96;
  const width = padLeft + plotWidth + padRight;

  // Log scale. These timings span three orders of magnitude — 0.010ms next to
  // 56ms — and on a linear axis every bar but the worst one disappears.
  const values = rows.flatMap(row => row.values.filter(v => v !== null && v > 0));
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...values))));
  const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...values))));
  const span = Math.log10(hi) - Math.log10(lo);
  const scale = value => Math.max(2, ((Math.log10(Math.max(value, lo)) - Math.log10(lo)) / span) * plotWidth);

  const decades = [];
  for (let power = Math.log10(lo); power <= Math.log10(hi) + 0.001; ++power) {
    decades.push(Math.pow(10, power));
  }
  const ticks = decades.map(value => {
    const x = padLeft + ((Math.log10(value) - Math.log10(lo)) / span) * plotWidth;
    const label = value >= 1 ? `${value}ms` : `${value.toFixed(String(value).length - 2)}ms`;
    return `    <line x1="${x}" y1="${padTop - 14}" x2="${x}" y2="${height - 78}" stroke="${INK.grid}"/>
    <text x="${x}" y="${height - 58}" fill="${INK.muted}" font-size="11" text-anchor="middle">${label}</text>`;
  }).join('\n');

  const bars = rows.map((row, rowIndex) => {
    const top = padTop + rowIndex * (rowHeight + groupGap);
    const label = `    <text x="${padLeft - 14}" y="${top + rowHeight / 2 + 4}" fill="${INK.text}" font-size="12.5"
      text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${escapeText(row.label)}</text>`;
    const drawn = row.values.map((value, seriesIndex) => {
      if (value === null) { return ''; }
      const y = top + seriesIndex * barHeight;
      const w = Math.max(1, scale(value));
      const delay = (rowIndex * 0.05).toFixed(2);
      return `    <g class="bar" style="--delay:${delay}s">
      <rect x="${padLeft}" y="${y}" width="${w.toFixed(1)}" height="${barHeight - 1}" rx="2"
        fill="url(#bar-${seriesIndex})" filter="url(#halo)"/>
      <text x="${Math.min(padLeft + w + 8, padLeft + plotWidth + 6)}" y="${y + barHeight - 3}" fill="${INK.muted}"
        font-size="10.5" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${value < 1 ? value.toFixed(3) : value.toFixed(2)}</text>
    </g>`;
    }).join('\n');
    return `${label}\n${drawn}`;
  }).join('\n');

  const legend = seriesNames.map((name, i) => {
    const x = padLeft - 14 + i * 168;
    return `    <rect x="${x}" y="${padTop - 46}" width="10" height="10" rx="2" fill="${INK.series[i]}"/>
    <text x="${x + 16}" y="${padTop - 37}" fill="${INK.muted}" font-size="11.5">${escapeText(name)}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
  viewBox="0 0 ${width} ${height}" font-family="Inter,system-ui,-apple-system,sans-serif">
${defs()}
  <style>
    .bar rect { transform-box: fill-box; transform-origin: left center;
      animation: grow 640ms cubic-bezier(0,0.7,0.5,1) both; animation-delay: var(--delay); }
    @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) { .bar rect { animation: none; } }
  </style>
  <rect width="${width}" height="${height}" fill="${INK.canvas}"/>
  <text x="24" y="40" fill="${INK.text}" font-size="17" font-weight="600">${escapeText(title)}</text>
  <text x="24" y="62" fill="${INK.muted}" font-size="12">${escapeText(subtitle)}</text>
${legend}
${ticks}
${bars}
  <text x="24" y="${height - 28}" fill="${INK.muted}" font-size="11">${escapeText(footer)}</text>
</svg>
`;
}
