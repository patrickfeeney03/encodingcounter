import { fromBase64Url, toBase64Url } from './base64url'

export const LEGACY_URL_VERSION = 1 as const
export const SINGLE_URL_VERSION = 2 as const
export const URL_VERSION = 3 as const
export const DEFAULT_PBKDF2_ITERATIONS = 100_000

export type UrlVersion = typeof LEGACY_URL_VERSION | typeof SINGLE_URL_VERSION | typeof URL_VERSION
export type CountdownMode = 'countdown' | 'elapsed'
export type TimerItemMode = CountdownMode | 'paused'

export type SignedParams = {
  k: string
  i: number
  s: string
}

export type TimerItem =
  | {
      mode: 'countdown'
      targetMs: number
      label?: string
    }
  | {
      mode: 'elapsed'
      targetMs: number
      label?: string
    }
  | {
      mode: 'paused'
      durationMs: number
      label?: string
    }

export type TimerCollectionParams = {
  v: UrlVersion
  items: TimerItem[]
  encodedData?: string
  signed?: SignedParams
}

export type ParsedTimerCollection = {
  v: UrlVersion
  items: TimerItem[]
  encodedData?: string
  signed?: SignedParams
}

export type ParseResult =
  | { ok: true; value: ParsedTimerCollection }
  | { ok: false; error: string }

type LegacyCanonicalInput = {
  v?: typeof LEGACY_URL_VERSION | typeof SINGLE_URL_VERSION
  t: number
  l?: string
  m?: CountdownMode
  k?: string
  i?: number
}

type V3CanonicalInput = {
  v?: typeof URL_VERSION
  d: string
  k?: string
  i?: number
}

type CompactTimerItem =
  | { m: 'c'; t: number; l?: string }
  | { m: 'e'; t: number; l?: string }
  | { m: 'p'; d: number; l?: string }

function encodeValue(value: string): string {
  return encodeURIComponent(value)
}

function parseIntStrict(input: string): number | null {
  if (!/^-?\d+$/.test(input)) return null
  const n = Number(input)
  return Number.isFinite(n) ? n : null
}

function encodeCountdownMode(mode: CountdownMode): string {
  return mode === 'elapsed' ? 'e' : 'c'
}

function decodeCountdownMode(value: string): CountdownMode | null {
  if (value === 'c') return 'countdown'
  if (value === 'e') return 'elapsed'
  return null
}

function encodeItem(item: TimerItem): CompactTimerItem {
  if (item.mode === 'paused') {
    const out: CompactTimerItem = { m: 'p', d: Math.trunc(item.durationMs) }
    if (item.label && item.label.length > 0) out.l = item.label
    return out
  }

  const out: CompactTimerItem = {
    m: item.mode === 'countdown' ? 'c' : 'e',
    t: Math.trunc(item.targetMs),
  }
  if (item.label && item.label.length > 0) out.l = item.label
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeItem(input: unknown): TimerItem | null {
  if (!isRecord(input) || typeof input.m !== 'string') return null

  if (input.m === 'c' || input.m === 'e') {
    if (typeof input.t !== 'number' || !Number.isFinite(input.t) || input.t <= 0) return null
    if (input.l !== undefined && typeof input.l !== 'string') return null
    return {
      mode: input.m === 'c' ? 'countdown' : 'elapsed',
      targetMs: Math.trunc(input.t),
      label: typeof input.l === 'string' && input.l.length > 0 ? input.l : undefined,
    }
  }

  if (input.m === 'p') {
    if (typeof input.d !== 'number' || !Number.isFinite(input.d) || input.d < 0) return null
    if (input.l !== undefined && typeof input.l !== 'string') return null
    return {
      mode: 'paused',
      durationMs: Math.trunc(input.d),
      label: typeof input.l === 'string' && input.l.length > 0 ? input.l : undefined,
    }
  }

  return null
}

export function encodeCollectionPayload(items: TimerItem[]): string {
  const payload = JSON.stringify({ items: items.map(encodeItem) })
  const bytes = new TextEncoder().encode(payload)
  return toBase64Url(bytes)
}

export function decodeCollectionPayload(input: string): TimerItem[] {
  let decoded: unknown
  try {
    const bytes = fromBase64Url(input)
    const json = new TextDecoder().decode(bytes)
    decoded = JSON.parse(json)
  } catch {
    throw new Error('Invalid d (payload): not valid encoded JSON')
  }

  if (!isRecord(decoded) || !Array.isArray(decoded.items) || decoded.items.length === 0) {
    throw new Error('Invalid d (payload): missing items array')
  }

  const items: TimerItem[] = []
  for (const item of decoded.items) {
    const parsed = decodeItem(item)
    if (!parsed) throw new Error('Invalid d (payload): contains an invalid timer item')
    items.push(parsed)
  }
  return items
}

export function buildCanonicalPayload(input: LegacyCanonicalInput | V3CanonicalInput): string {
  if ('d' in input) {
    const v = input.v ?? URL_VERSION
    const parts: string[] = [`v=${v}`, `d=${input.d}`]
    if (input.k) parts.push(`k=${input.k}`)
    if (typeof input.i === 'number') parts.push(`i=${Math.trunc(input.i)}`)
    return parts.join('&')
  }

  const v = input.v ?? SINGLE_URL_VERSION
  const parts: string[] = [`v=${v}`, `t=${Math.trunc(input.t)}`]
  if (v >= SINGLE_URL_VERSION) {
    if (!input.m) throw new Error('Mode is required for v2 links')
    parts.push(`m=${encodeCountdownMode(input.m)}`)
  }
  if (input.l && input.l.length > 0) parts.push(`l=${encodeValue(input.l)}`)
  if (input.k) parts.push(`k=${input.k}`)
  if (typeof input.i === 'number') parts.push(`i=${Math.trunc(input.i)}`)
  return parts.join('&')
}

export function buildTimerHash(params: TimerCollectionParams): string {
  if (params.v === URL_VERSION) {
    const data = params.encodedData ?? encodeCollectionPayload(params.items)
    const canonical = buildCanonicalPayload({
      v: URL_VERSION,
      d: data,
      k: params.signed?.k,
      i: params.signed?.i,
    })
    const withSig = params.signed ? `${canonical}&s=${params.signed.s}` : canonical
    return `#/c?${withSig}`
  }

  if (params.items.length !== 1) {
    throw new Error('Legacy links can only encode a single timer')
  }

  const item = params.items[0]
  if (item.mode === 'paused') {
    throw new Error('Legacy links do not support paused timers')
  }

  const canonical = buildCanonicalPayload({
    v: params.v,
    t: item.targetMs,
    l: item.label,
    m: params.v >= SINGLE_URL_VERSION ? item.mode : undefined,
    k: params.signed?.k,
    i: params.signed?.i,
  })
  const withSig = params.signed ? `${canonical}&s=${params.signed.s}` : canonical
  return `#/c?${withSig}`
}

export const buildCountdownHash = buildTimerHash

function parseSignedParams(searchParams: URLSearchParams): { ok: true; value?: SignedParams } | { ok: false; error: string } {
  const k = searchParams.get('k')
  const iRaw = searchParams.get('i')
  const s = searchParams.get('s')
  const hasAnySigned = k !== null || iRaw !== null || s !== null
  if (!hasAnySigned) return { ok: true }

  if (!k || !iRaw || !s) {
    return { ok: false, error: 'Signed link is missing one of: k, i, s' }
  }

  let saltBytes: Uint8Array
  try {
    saltBytes = fromBase64Url(k)
  } catch {
    return { ok: false, error: 'Invalid k (salt): not valid base64url' }
  }
  if (saltBytes.byteLength < 8) return { ok: false, error: 'Invalid k (salt): too short' }

  const i = parseIntStrict(iRaw)
  if (i === null) return { ok: false, error: `Invalid i: ${iRaw}` }
  if (i !== DEFAULT_PBKDF2_ITERATIONS) {
    return {
      ok: false,
      error: `Unsupported iteration count i=${i} (expected ${DEFAULT_PBKDF2_ITERATIONS})`,
    }
  }
  if (s.length < 16) return { ok: false, error: 'Invalid s (signature): too short' }

  return { ok: true, value: { k, i, s } }
}

function parseLegacyItemFromSearchParams(
  v: typeof LEGACY_URL_VERSION | typeof SINGLE_URL_VERSION,
  searchParams: URLSearchParams,
): ParseResult {
  const tRaw = searchParams.get('t')
  if (!tRaw) return { ok: false, error: 'Missing required parameter: t' }
  const t = parseIntStrict(tRaw)
  if (t === null) return { ok: false, error: `Invalid t: ${tRaw}` }
  if (t <= 0) return { ok: false, error: `Invalid t (must be > 0): ${tRaw}` }

  const l = searchParams.get('l') ?? undefined
  const mRaw = searchParams.get('m')
  let mode: CountdownMode = 'countdown'
  if (v >= SINGLE_URL_VERSION) {
    if (!mRaw) return { ok: false, error: 'Missing required parameter: m' }
    const parsedMode = decodeCountdownMode(mRaw)
    if (!parsedMode) return { ok: false, error: `Invalid m: ${mRaw}` }
    mode = parsedMode
  }

  const signed = parseSignedParams(searchParams)
  if (!signed.ok) return signed

  return {
    ok: true,
    value: {
      v,
      items: [{ mode, targetMs: t, label: l }],
      signed: signed.value,
    },
  }
}

export function parseCountdownFromSearchParams(searchParams: URLSearchParams): ParseResult {
  const vRaw = searchParams.get('v') ?? `${LEGACY_URL_VERSION}`
  const v = parseIntStrict(vRaw)
  if (v !== LEGACY_URL_VERSION && v !== SINGLE_URL_VERSION && v !== URL_VERSION) {
    return { ok: false, error: `Unsupported version: v=${vRaw}` }
  }

  if (v === URL_VERSION) {
    const d = searchParams.get('d')
    if (!d) return { ok: false, error: 'Missing required parameter: d' }

    let items: TimerItem[]
    try {
      items = decodeCollectionPayload(d)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid d (payload)' }
    }

    const signed = parseSignedParams(searchParams)
    if (!signed.ok) return signed

    return {
      ok: true,
      value: {
        v,
        items,
        encodedData: d,
        signed: signed.value,
      },
    }
  }

  return parseLegacyItemFromSearchParams(v, searchParams)
}
