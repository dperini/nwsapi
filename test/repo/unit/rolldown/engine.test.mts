import { beforeEach, expect, test, vi } from 'vitest'
const build = vi.hoisted(() => vi.fn())
vi.mock('rolldown', () => ({ build }))
import { bundleEngine } from '../../../../scripts/repo/rolldown/engine.mts'
beforeEach(() => {
  build.mockReset()
})
test.each([
  'const x=1',
  'obj();',
  '(function(){})()',
  '(function Other(){})()',
  '(function Export(){})();',
  '(function Export(){})(this, ()=>0)',
  '(function Export(){})(this,function Other(){})',
])('rejects missing wrapper or factory %#', async source => {
  await expect(bundleEngine(source)).rejects.toThrow()
  expect(build).not.toHaveBeenCalled()
})
test.each([{ output: [] }, { output: [{ type: 'asset' }] }])(
  'rejects missing bundled chunks %#',
  async ({ output }) => {
    build.mockResolvedValue({ output })
    await expect(
      bundleEngine('(function Export(){})(this,function Factory(){})'),
    ).rejects.toThrow()
  },
)
test('factory bundling preserves the wrapper and resolves only its virtual module', async () => {
  build.mockImplementation(async options => {
    const plugin = options.plugins[0]
    expect(plugin.resolveId('nwsapi:factory')).toBe('nwsapi:factory')
    expect(plugin.resolveId('other')).toBeNull()
    expect(plugin.load('other')).toBeNull()
    expect(plugin.load('nwsapi:factory')).toBe(
      'export default function Factory(){return 1}',
    )
    return {
      output: [
        { type: 'chunk', code: 'var nwsapiFactory=function(){return 1}' },
      ],
    }
  })
  const output = await bundleEngine(
    '(function Export(){})(this,function Factory(){return 1});',
  )
  expect(output.startsWith('(function Export(){})(this,(function () {')).toBe(
    true,
  )
  expect(output.endsWith('})());')).toBe(true)
})
