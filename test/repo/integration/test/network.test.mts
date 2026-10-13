import { createServer } from 'node:http'
import { expect, test } from 'vitest'

test('integration fixtures allow loopback fetch bodies while external HTTP remains blocked', async () => {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => response.end(Buffer.concat(chunks)))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP fixture address.')
    }
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      method: 'POST',
      body: 'fixture body',
    })
    expect(await response.text()).toBe('fixture body')
    await expect(fetch('https://unmocked.invalid/')).rejects.toMatchObject({
      code: 'ENETUNREACH',
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }),
    )
  }
})
