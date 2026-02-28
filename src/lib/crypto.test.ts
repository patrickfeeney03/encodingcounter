import { describe, expect, it } from 'vitest'
import { deriveHmacKey, hmacSha256Base64Url, verifyHmacSha256Base64Url } from './crypto'

describe('crypto', () => {
  it('signs and verifies HMAC payload', async () => {
    const saltBytes = new Uint8Array(16)
    for (let i = 0; i < saltBytes.length; i++) saltBytes[i] = i
    const key = await deriveHmacKey({ passphrase: 'secret', saltBytes, iterations: 100000 })
    const sig = await hmacSha256Base64Url({ key, data: 'v=1&t=123' })
    const ok = await verifyHmacSha256Base64Url({ key, data: 'v=1&t=123', signatureBase64Url: sig })
    expect(ok).toBe(true)
    const bad = await verifyHmacSha256Base64Url({ key, data: 'v=1&t=124', signatureBase64Url: sig })
    expect(bad).toBe(false)
  })
})

