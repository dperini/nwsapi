import { object } from '@optique/core/constructs'
import { runParserSync } from '@optique/core/facade'
import { multiple, optional, withDefault } from '@optique/core/modifiers'
import { argument, flag, option, passThrough } from '@optique/core/primitives'
import type { Parser } from '@optique/core/parser'
import type { OptionName } from '@optique/core/usage'
import { string } from '@optique/core/valueparser'

interface OptionDefinition {
  type: 'boolean' | 'string'
  short?: string
  multiple?: boolean
  default?: boolean | string | undefined
}

type ParsedOptionValue<T extends OptionDefinition> = T extends {
  multiple: true
}
  ? T['type'] extends 'boolean'
    ? boolean[]
    : string[]
  : T['type'] extends 'boolean'
    ? T extends { default: boolean }
      ? boolean
      : boolean | undefined
    : T extends { default: string }
      ? string
      : string | undefined

type ParsedValues<TOptions extends Record<string, OptionDefinition>> = {
  [Key in keyof TOptions]: ParsedOptionValue<TOptions[Key]>
}

interface ParseOptions<
  TOptions extends Record<string, OptionDefinition> = Record<
    string,
    OptionDefinition
  >,
> {
  args?: readonly string[]
  options?: TOptions
  allowPositionals?: boolean
  strict?: boolean
}

/**
 * Optique-backed adapter for commands that still use the node:util schema
 * shape. This lets large internal command families migrate without changing
 * their existing result contract all at once.
 */
export function parseCliArgs<
  const TOptions extends Record<string, OptionDefinition>,
>(
  {
    args = process.argv.slice(2),
    options = {} as TOptions,
    allowPositionals,
    strict = true,
  }: ParseOptions<TOptions>,
  programName = 'nwsapi',
) {
  const fields: Record<string, Parser> = {}
  for (const [name, definition] of Object.entries(options)) {
    const names = (
      definition.short ? [`-${definition.short}`, `--${name}`] : [`--${name}`]
    ) as [OptionName, ...OptionName[]]
    let parser: Parser =
      definition.type === 'boolean'
        ? (flag(...names) as Parser)
        : (option(...names, string()) as Parser)
    if (definition.multiple) {
      parser = multiple(parser) as Parser
    } else if (definition.default !== undefined) {
      parser = withDefault(parser, definition.default) as Parser
    } else {
      parser = optional(parser) as Parser
    }
    fields[name] = parser as Parser
  }
  if (allowPositionals) {
    fields['__positionals'] = multiple(argument(string())) as Parser
  }
  if (!strict) {
    fields['__remaining'] = passThrough({ format: 'greedy' }) as Parser
  }
  const parser = object(fields)
  const parsed = runParserSync(parser, programName, args, {
    completion: { option: true },
  }) as Record<string, unknown>
  const positionals = (parsed['__positionals'] ?? []) as string[]
  const values = { ...parsed }
  delete values['__positionals']
  delete values['__remaining']
  return { values: values as ParsedValues<TOptions>, positionals }
}
