export type InteractiveAction = {
  label: string
  description: string
  command: string
  args: string[]
  prompt?: string
}

export const interactiveActions: readonly InteractiveAction[] = [
  {
    label: 'Help',
    description: 'Read the available command and option list.',
    command: 'nwsapi --help',
    args: ['--help'],
  },
  {
    label: 'Compile a selector',
    description: 'Inspect a generated resolver for one CSS selector.',
    command: 'nwsapi compile <selector>',
    args: ['compile'],
    prompt: 'CSS selector',
  },
  {
    label: 'Add jsdom selector override',
    description: 'Make this project use nwsapi for jsdom selector queries.',
    command: 'nwsapi jsdom add',
    args: ['jsdom', 'add'],
  },
  {
    label: 'Remove jsdom selector override',
    description: 'Remove the selector override managed by nwsapi.',
    command: 'nwsapi jsdom remove',
    args: ['jsdom', 'remove'],
  },
]
