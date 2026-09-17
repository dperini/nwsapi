import { Type } from 'typebox'
import type { Static, TSchema } from 'typebox'

export const VERSION = '^\\d+\\.\\d+\\.\\d+$'
export const INTEGRITY = '^sha(?:256|512)-[A-Za-z0-9+/]+={0,2}$'
export const RELATIVE_PATH = '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[A-Za-z0-9_./-]+$'

export const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'linux-arm64-musl',
  'linux-x64-musl',
  'win32-arm64',
  'win32-x64',
]

export function platformSchema(schema: TSchema) {
  return Type.Object(
    {},
    {
      minProperties: 1,
      propertyNames: { enum: PLATFORMS },
      additionalProperties: schema,
    },
  )
}

export const AssetSchema = Type.Object(
  {
    asset: Type.String({ pattern: '^[A-Za-z0-9_][A-Za-z0-9_.-]*$' }),
    binary: Type.String({ pattern: RELATIVE_PATH }),
    integrity: Type.String({ pattern: INTEGRITY }),
    format: Type.Optional(
      Type.Union([Type.Literal('archive'), Type.Literal('binary')]),
    ),
  },
  { additionalProperties: false },
)

export const GithubToolSchema = Type.Object(
  {
    origin: Type.Literal('gh-asset'),
    repository: Type.String({ pattern: '^github:[\\w-]+/[\\w.-]+$' }),
    version: Type.String({ pattern: VERSION }),
    tag: Type.Optional(Type.String({ pattern: '^[\\w.-]+$' })),
    platforms: platformSchema(AssetSchema),
  },
  { additionalProperties: false },
)

export const ToolsSchema = Type.Object(
  {
    $schema: Type.Optional(Type.String()),
    tools: Type.Object(
      {
        node: Type.Object(
          {
            origin: Type.Literal('nub'),
            version: Type.String({ pattern: VERSION }),
          },
          { additionalProperties: false },
        ),
        npm: Type.Object(
          {
            ...AssetSchema.properties,
            origin: Type.Literal('npm'),
            repository: Type.Literal('npm:npm'),
            version: Type.String({ pattern: VERSION }),
          },
          { additionalProperties: false },
        ),
        pnpm: GithubToolSchema,
        nub: GithubToolSchema,
        sfw: GithubToolSchema,
        uv: GithubToolSchema,
        zizmor: GithubToolSchema,
        actionlint: GithubToolSchema,
        cdxgen: GithubToolSchema,
        opengrep: GithubToolSchema,
        trivy: GithubToolSchema,
        trufflehog: GithubToolSchema,
        agentshield: Type.Object(
          {
            origin: Type.Literal('catalog'),
            package: Type.Literal('ecc-agentshield'),
            version: Type.String({ pattern: VERSION }),
            integrity: Type.String({ pattern: INTEGRITY }),
            binary: Type.Literal('agentshield'),
          },
          { additionalProperties: false },
        ),
        'skill-scanner': Type.Object(
          {
            origin: Type.Literal('python'),
            package: Type.Literal('cisco-ai-skill-scanner'),
            version: Type.String({ pattern: VERSION }),
            platforms: platformSchema(
              Type.Object(
                {
                  asset: Type.String({
                    pattern:
                      '^https://files\\.pythonhosted\\.org/packages/[A-Za-z0-9_./-]+\\.whl$',
                  }),
                  integrity: Type.String({ pattern: INTEGRITY }),
                },
                { additionalProperties: false },
              ),
            ),
          },
          { additionalProperties: false },
        ),
        skillspector: Type.Object(
          {
            origin: Type.Literal('git'),
            repository: Type.Literal('github:NVIDIA/skillspector'),
            version: Type.String({ pattern: '^[a-f0-9]{40}$' }),
            project: Type.Literal('.config/security/skillspector'),
          },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
  },
  {
    additionalProperties: false,
    title: 'Verified contributor and security tools',
  },
)

export type ToolsConfig = Static<typeof ToolsSchema>
