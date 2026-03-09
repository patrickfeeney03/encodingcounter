import { describe, expect, it } from 'vitest'
import {
  buildCanonicalPayload,
  buildTimerHash,
  decodeCollectionPayload,
  encodeCollectionPayload,
  LEGACY_URL_VERSION,
  parseCountdownFromSearchParams,
  SINGLE_URL_VERSION,
  URL_VERSION,
} from './urlState'

describe('urlState', () => {
  it('buildCanonicalPayload is stable for v3 links', () => {
    const payload = buildCanonicalPayload({
      v: URL_VERSION,
      d: 'payload',
      k: 'salt',
      i: 100000,
    })
    expect(payload).toBe('v=3&d=payload&k=salt&i=100000')
  })

  it('encodes and decodes timer collections', () => {
    const encoded = encodeCollectionPayload([
      { mode: 'countdown', targetMs: 123, label: 'Launch' },
      { mode: 'elapsed', targetMs: 456 },
      { mode: 'paused', durationMs: 789, label: 'Frozen' },
    ])

    expect(decodeCollectionPayload(encoded)).toEqual([
      { mode: 'countdown', targetMs: 123, label: 'Launch' },
      { mode: 'elapsed', targetMs: 456 },
      { mode: 'paused', durationMs: 789, label: 'Frozen' },
    ])
  })

  it('buildTimerHash includes encoded payload and signature for v3 collections', () => {
    const hash = buildTimerHash({
      v: URL_VERSION,
      items: [{ mode: 'countdown', targetMs: 999, label: 'Launch' }],
      encodedData: 'payload',
      signed: { k: 'k', i: 100000, s: 'sig' },
    })
    expect(hash).toBe('#/c?v=3&d=payload&k=k&i=100000&s=sig')
  })

  it('parseCountdownFromSearchParams parses v3 mixed collections', () => {
    const d = encodeCollectionPayload([
      { mode: 'countdown', targetMs: 1700000000000, label: 'Countdown' },
      { mode: 'elapsed', targetMs: 1600000000000, label: 'Elapsed' },
      { mode: 'paused', durationMs: 123456, label: 'Paused' },
    ])

    const parsed = parseCountdownFromSearchParams(new URLSearchParams(`v=3&d=${d}`))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.v).toBe(URL_VERSION)
      expect(parsed.value.encodedData).toBe(d)
      expect(parsed.value.items).toEqual([
        { mode: 'countdown', targetMs: 1700000000000, label: 'Countdown' },
        { mode: 'elapsed', targetMs: 1600000000000, label: 'Elapsed' },
        { mode: 'paused', durationMs: 123456, label: 'Paused' },
      ])
    }
  })

  it('parseCountdownFromSearchParams parses unsigned v2 links', () => {
    const params = new URLSearchParams(`v=${SINGLE_URL_VERSION}&t=1700000000000&m=c&l=Hello%20World`)
    const parsed = parseCountdownFromSearchParams(params)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.v).toBe(SINGLE_URL_VERSION)
      expect(parsed.value.items).toEqual([{ mode: 'countdown', targetMs: 1700000000000, label: 'Hello World' }])
      expect(parsed.value.signed).toBeUndefined()
    }
  })

  it('parseCountdownFromSearchParams treats v1 links as countdown links', () => {
    const params = new URLSearchParams(`v=${LEGACY_URL_VERSION}&t=1700000000000&l=Hello%20World`)
    const parsed = parseCountdownFromSearchParams(params)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.v).toBe(LEGACY_URL_VERSION)
      expect(parsed.value.items).toEqual([{ mode: 'countdown', targetMs: 1700000000000, label: 'Hello World' }])
    }
  })

  it('parseCountdownFromSearchParams rejects v3 links without data payload', () => {
    const parsed = parseCountdownFromSearchParams(new URLSearchParams('v=3'))
    expect(parsed).toEqual({ ok: false, error: 'Missing required parameter: d' })
  })
})
