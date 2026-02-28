import { describe, expect, it } from 'vitest'
import { buildCanonicalPayload, buildCountdownHash, parseCountdownFromSearchParams, URL_VERSION } from './urlState'

describe('urlState', () => {
  it('buildCanonicalPayload is stable and encodes label', () => {
    const payload = buildCanonicalPayload({ v: URL_VERSION, t: 123, l: 'A B', k: 'salt', i: 100000 })
    expect(payload).toBe('v=1&t=123&l=A%20B&k=salt&i=100000')
  })

  it('buildCountdownHash includes signature when present', () => {
    const hash = buildCountdownHash({
      v: URL_VERSION,
      t: 999,
      l: 'Launch',
      signed: { k: 'k', i: 100000, s: 'sig' },
    })
    expect(hash).toBe('#/c?v=1&t=999&l=Launch&k=k&i=100000&s=sig')
  })

  it('parseCountdownFromSearchParams parses unsigned links', () => {
    const params = new URLSearchParams('v=1&t=1700000000000&l=Hello%20World')
    const parsed = parseCountdownFromSearchParams(params)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.t).toBe(1700000000000)
      expect(parsed.value.l).toBe('Hello World')
      expect(parsed.value.signed).toBeUndefined()
    }
  })
})

