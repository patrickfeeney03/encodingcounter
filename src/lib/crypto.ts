import { fromBase64Url } from './base64url'

export async function deriveHmacKey(params: {
  passphrase: string
  saltBytes: Uint8Array
  iterations: number
}): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto not available (crypto.subtle)')
  const encoder = new TextEncoder()
  const salt = new Uint8Array(params.saltBytes).buffer as ArrayBuffer
  const passphraseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(params.passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: params.iterations,
    },
    passphraseKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  )
}

export async function hmacSha256Base64Url(params: { key: CryptoKey; data: string }): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto not available (crypto.subtle)')
  const encoder = new TextEncoder()
  const sig = await globalThis.crypto.subtle.sign('HMAC', params.key, encoder.encode(params.data))
  // Implement inline base64url to avoid circular deps
  const bytes = new Uint8Array(sig)
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function verifyHmacSha256Base64Url(params: {
  key: CryptoKey
  data: string
  signatureBase64Url: string
}): Promise<boolean> {
  const expected = await hmacSha256Base64Url({ key: params.key, data: params.data })
  let a: Uint8Array
  let b: Uint8Array
  try {
    a = fromBase64Url(expected)
    b = fromBase64Url(params.signatureBase64Url)
  } catch {
    return false
  }
  return constantTimeEqual(a, b)
}
