function hasBuffer(): boolean {
  return typeof Buffer !== 'undefined'
}

function base64Encode(bytes: Uint8Array): string {
  if (hasBuffer()) return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64DecodeToBytes(base64: string): Uint8Array {
  if (hasBuffer()) return new Uint8Array(Buffer.from(base64, 'base64'))
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function toBase64Url(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function fromBase64Url(input: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]*$/.test(input)) throw new Error('Invalid base64url characters')
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
  return base64DecodeToBytes(base64 + pad)
}
