import { escapeText } from '../charts.mts'

export const geomean = (values: number[]) =>
  Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  )

export function timeChange(ratio: number) {
  if (Math.abs(ratio - 1) < 0.0005) {
    return 'About the same query time'
  }
  return `${(Math.abs(1 - ratio) * 100).toFixed(1)}% ${ratio < 1 ? 'less' : 'more'} query time`
}

export function bar(
  label: string,
  cost: number,
  maximum: number,
  kind: string,
) {
  const change = kind === 'rule' ? 'Reference' : timeChange(cost / 100)
  const color = kind !== 'rule' && cost > 100 ? 'slower' : kind
  return `<div class="label"><span>${escapeText(label)}</span><strong>${cost.toFixed(1)} units</strong></div><div class="track"><div class="bar ${color}" style="width:${((cost / maximum) * 100).toFixed(3)}%"></div></div><div class="bar-note">${change}</div>`
}
