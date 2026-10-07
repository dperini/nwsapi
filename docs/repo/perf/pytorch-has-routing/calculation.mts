import chromium from '../../../../assets/repo/pytorch/model/chromium-weights.generated.json'
import jsdom from '../../../../assets/repo/pytorch/model/jsdom-weights.generated.json'
import { code } from './highlight.mts'
import { element, text } from './ui.mts'

type SavedModel = {
  weights: Record<string, number[] | number[][]>
  mean: number[]
  scale: number[]
  chosen: { hidden: number; threshold: number }
}
export type PolicyInputs = {
  anchors: number
  witnesses: number
  attributes: number
  dense: number
  ratio: number
}
const labels = [
  'Card candidates',
  'Warning candidates',
  'Card filter flag',
  'Warning filter flag',
  'Both selectors are plain classes',
  'Warnings / cards',
]

function arithmetic(model: SavedModel, inputs: number[]) {
  const first = model.weights['0.weight'] as number[][]
  const biases = model.weights['0.bias'] as number[]
  const units = first.map((weights, index) => {
    const multipliers = weights.map((weight, i) => weight / model.scale[i]!)
    const bias =
      biases[index]! -
      multipliers.reduce((sum, weight, i) => sum + weight * model.mean[i]!, 0)
    const terms = multipliers.map((weight, i) => weight * inputs[i]!)
    const sum = terms.reduce((value, term) => value + term, bias)
    return {
      bias,
      multipliers,
      terms,
      sum,
      value: model.chosen.hidden ? Math.max(0, sum) : sum,
    }
  })
  const last = model.weights['2.weight'] as number[][] | undefined
  const outputBias = model.weights['2.bias'] as number[] | undefined
  const score = last
    ? units.reduce(
        (value, unit, i) => value + last[0]![i]! * unit.value,
        outputBias![0]!,
      )
    : units[0]!.value
  return {
    units,
    score,
    threshold: model.chosen.threshold + 1e-5,
    last,
    outputBias,
  }
}

function number(value: number) {
  return value.toFixed(6)
}

function showFeatures(inputs: number[], model: SavedModel) {
  element('calculation-features').innerHTML = inputs
    .map(
      (value, i) =>
        `<tr><th scope="row">${labels[i]}</th><td>${number(value)}</td><td>${number((value - model.mean[i]!) / model.scale[i]!)}</td></tr>`,
    )
    .join('')
}

function showUnits(result: ReturnType<typeof arithmetic>, model: SavedModel) {
  element('calculation-units').innerHTML = result.units
    .map(
      (unit, i) =>
        `<article><h4>${model.chosen.hidden ? `Hidden unit ${i + 1}` : 'One linear score'}</h4><p>Sum: <strong>${number(unit.sum)}</strong>${model.chosen.hidden ? `<br />After ReLU: <strong>${number(unit.value)}</strong>` : ''}</p></article>`,
    )
    .join('')
  const unit = result.units[0]!
  code(
    'calculation-math',
    `// Unit 1 uses coefficients derived from the saved JSON.
// Normalization is folded into multipliers and bias in the export.
sum = ${number(unit.bias)} // bias
${unit.terms.map((term, i) => `    + ${number(term)} // ${labels[i]} × ${number(unit.multipliers[i]!)}`).join('\n')}
    = ${number(unit.sum)}
${model.chosen.hidden ? `hidden1 = Math.max(0, sum) = ${number(unit.value)}` : 'score = sum // no hidden layer'}`,
  )
}

function showOutput(
  result: ReturnType<typeof arithmetic>,
  model: SavedModel,
  actual: boolean,
) {
  text(
    'calculation-score',
    `${number(result.score)} > ${number(result.threshold)} → ${actual}`,
  )
  const terms = result.last
    ? `score = ${number(result.outputBias![0]!)}\n${result.units.map((unit, i) => `      + ${number(result.last![0]![i]!)} × ${number(unit.value)} // hidden${i + 1}`).join('\n')}\n      = ${number(result.score)}`
    : `score = ${number(result.score)} // the linear result above`
  code(
    'calculation-output',
    `${terms}\n\n// Saved threshold: ${model.chosen.threshold}, plus a 0.00001 margin.\noverride = Number.isFinite(score) && score > ${number(result.threshold)}\n// ${actual ? 'true: use inverse' : 'false: keep forward'}`,
  )
  text(
    'calculation-check',
    result.score > result.threshold === actual
      ? 'This calculation agrees with the actual generated policy call above. The score is not a probability or a speedup estimate.'
      : 'The explanation and exported function disagree. Use the actual saved function outcome above.',
  )
}

export function renderCalculation(
  state: PolicyInputs,
  host: string,
  eligible: boolean,
  actual: boolean,
) {
  const model: SavedModel = host === 'chromium' ? chromium : jsdom
  const inputs = [
    state.anchors,
    state.witnesses,
    state.attributes >> 1,
    state.attributes & 1,
    state.dense,
    state.ratio,
  ]
  showFeatures(inputs, model)
  text(
    'calculation-host',
    host === 'chromium'
      ? 'Chromium · 6 inputs → 4 hidden units → 1 score'
      : 'jsdom · 6 inputs → 1 linear score',
  )
  element('calculation-arithmetic').hidden = !eligible
  text(
    'calculation-guard',
    eligible
      ? 'The guards pass. Follow the actual saved weights through the calculation.'
      : 'A guard declines this query. The exported policy stops before the learned arithmetic. Choose Eligible query above to follow a complete calculation.',
  )
  if (!eligible) {
    return
  }
  const result = arithmetic(model, inputs)
  showUnits(result, model)
  showOutput(result, model, actual)
}

export function initializeCalculation() {
  const sections = [
    'calculation-input-panel',
    'calculation-unit-panel',
    'calculation-output-panel',
  ]
  document
    .querySelectorAll<HTMLButtonElement>('[data-calc-stage]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const selected = Number(button.dataset['calcStage'])
        sections.forEach((id, i) => {
          element(id).hidden = selected !== i
        })
        document
          .querySelectorAll<HTMLButtonElement>('[data-calc-stage]')
          .forEach(control => {
            control.setAttribute('aria-pressed', String(control === button))
          })
      })
    })
}
