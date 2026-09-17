import { Type } from 'typebox'

export const ReleaseRequestSchema = Type.Object(
  {
    version: Type.Union([
      Type.Null(),
      Type.String({ pattern: '^3\\.\\d+\\.\\d+(?:-[A-Za-z0-9.-]+)?$' }),
    ]),
    distTag: Type.Literal('next'),
  },
  { additionalProperties: false, title: 'Staged v3 release request' },
)

export const ReleaseReceiptSchema = Type.Object(
  {
    name: Type.Literal('nwsapi'),
    version: Type.String({ pattern: '^3\\.\\d+\\.\\d+(?:-[A-Za-z0-9.-]+)?$' }),
    commit: Type.String({ pattern: '^[a-f0-9]{40}$' }),
    integrity: Type.String({ pattern: '^sha512-[A-Za-z0-9+/]{86}==$' }),
    distTag: Type.Literal('next'),
    filename: Type.String({ pattern: '^nwsapi-3\\.[A-Za-z0-9.-]+\\.tgz$' }),
  },
  { additionalProperties: false, title: 'Reserved npm release artifact' },
)
