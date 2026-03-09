import { describe, expect, it } from 'vitest'
import {
  buildCanonicalPayload,
  buildCountdownHash,
  LEGACY_URL_VERSION,
  parseCountdownFromSearchParams,
  URL_VERSION,
} from './urlState'

describe('urlState', () => {
  it('buildCanonicalPayload is stable and encodes label for v2 links', () => {
    const payload = buildCanonicalPayload({
      v: URL_VERSION,
      t: 123,
      m: 'countdown',
      l: 'A B',
      k: 'salt',
      i: 100000,
    })
    expect(payload).toBe('v=2&t=123&m=c&l=A%20B&k=salt&i=100000')
  })

  it('buildCountdownHash includes signature when present', () => {
    const hash = buildCountdownHash({
      v: URL_VERSION,
      t: 999,
      mode: 'elapsed',
      l: 'Launch',
      signed: { k: 'k', i: 100000, s: 'sig' },
    })
    expect(hash).toBe('#/c?v=2&t=999&m=e&l=Launch&k=k&i=100000&s=sig')
  })

  it('parseCountdownFromSearchParams parses unsigned v2 countdown links', () => {
    const params = new URLSearchParams('v=2&t=1700000000000&m=c&l=Hello%20World')
    const parsed = parseCountdownFromSearchParams(params)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.v).toBe(URL_VERSION)
      expect(parsed.value.t).toBe(1700000000000)
      expect(parsed.value.mode).toBe('countdown')
      expect(parsed.value.l).toBe('Hello World')
      expect(parsed.value.signed).toBeUndefined()
    }
  })

  it('parseCountdownFromSearchParams parses elapsed links', () => {
    const params = new URLSearchParams('v=2&t=1700000000000&m=e')
    const parsed = parseCountdownFromSearchParams(params)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.mode).toBe('elapsed')
    }
  })

  it('parseCountdownFromSearchParams treats v1 links as countdown links', () => {
    const params = new URLSearchParams(`v=${LEGACY_URL_VERSION}&t=1700000000000&l=Hello%20World`)
    const parsed = parseCountdownFromSearchParams(params)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.v).toBe(LEGACY_URL_VERSION)
      expect(parsed.value.mode).toBe('countdown')
    }
  })

  it('parseCountdownFromSearchParams rejects v2 links without mode', () => {
    const parsed = parseCountdownFromSearchParams(new URLSearchParams('v=2&t=1700000000000'))
    expect(parsed).toEqual({ ok: false, error: 'Missing required parameter: m' })
  })
})
