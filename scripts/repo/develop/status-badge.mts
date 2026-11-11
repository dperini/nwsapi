import { translateWizard } from './language.mts'
import type { WizardLanguage } from './language.mts'
import { WIZARD_COLORS } from './palette.mts'
import { ui } from './solid-ui.mts'
import type { taskStatus } from './actions.mts'

export const STATUS_BACKGROUNDS = {
  warning: '#3c3219',
  success: '#13352b',
  error: '#402422',
  disabled: '#292f35',
  info: '#1b304a',
}

export function statusBadgeLabel(status: ReturnType<typeof taskStatus>) {
  if (status.kind === 'info' || status.kind === 'success') {
    return ''
  }
  return (
    status.kind === 'disabled' ? status.message : status.label
  ).toLowerCase()
}

export function statusBadge(
  status: () => ReturnType<typeof taskStatus>,
  language: () => WizardLanguage = () => 'en',
) {
  return ui('text', () => ({
    content: statusBadgeLabel(status())
      ? ` ${translateWizard(status().kind === 'disabled' ? status().message : status().label, language()).toLowerCase()} `
      : '',
    fg: WIZARD_COLORS[status().kind],
    bg: STATUS_BACKGROUNDS[status().kind],
    height: 1,
    flexShrink: 0,
  }))
}
