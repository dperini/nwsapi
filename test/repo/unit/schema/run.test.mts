import { expect, test } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  compileValidator,
  generateSchemas,
  SCHEMAS,
} from '../../../../scripts/repo/schema/run.mts'

test('schema generation is deterministic and drift checks include schemas and executable validators', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-schema-test-'))
  try {
    generateSchemas(false, root)
    generateSchemas(true, root)
    for (const name of Object.keys(SCHEMAS)) {
      const schema = JSON.parse(
        readFileSync(path.join(root, `.config/${name}.schema.json`), 'utf8'),
      )
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
    }
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(compileValidator(SCHEMAS['release-request'])).toString('base64')}`
    )
    expect(module.validate({ version: null, distTag: 'next' }).valid).toBe(true)
    expect(module.validate({ version: '3.0.0', distTag: 'latest' }).valid).toBe(
      false,
    )
    writeFileSync(path.join(root, '.config/generated/external-tools.mts'), '')
    expect(() => generateSchemas(true, root)).toThrow('Stale')
    expect(() => compileValidator({ type: 'unknown' })).toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
