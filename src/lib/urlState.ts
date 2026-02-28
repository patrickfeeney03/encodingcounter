import { fromBase64Url } from './base64url'

export const URL_VERSION = 1 as const
export const DEFAULT_PBKDF2_ITERATIONS = 100_000

export type SignedParams = {
  k: string
  i: number
  s: string
}

export type CountdownParams = {
  v: typeof URL_VERSION
  t: number
  l?: string
  signed?: SignedParams
}

export type ParseResult =
  | { ok: true; value: CountdownParams }
  | { ok: false; error: string }

function encodeValue(value: string): string {
  return encodeURIComponent(value)
}

export function buildCanonicalPayload(input: {
  v?: number
  t: number
  l?: string
  k?: string
  i?: number
}): string {
  const v = input.v ?? URL_VERSION
  const parts: string[] = [`v=${v}`, `t=${Math.trunc(input.t)}`]
  if (input.l && input.l.length > 0) parts.push(`l=${encodeValue(input.l)}`)
  if (input.k) parts.push(`k=${input.k}`)
  if (typeof input.i === 'number') parts.push(`i=${Math.trunc(input.i)}`)
  return parts.join('&')
}

export function buildCountdownHash(params: CountdownParams): string {
  const canonical = buildCanonicalPayload({
    v: params.v,
    t: params.t,
    l: params.l,
    k: params.signed?.k,
    i: params.signed?.i,
  })
  const withSig = params.signed ? `${canonical}&s=${params.signed.s}` : canonical
  return `#/c?${withSig}`
}

function parseIntStrict(input: string): number | null {
  if (!/^-?\d+$/.test(input)) return null
  const n = Number(input)
  return Number.isFinite(n) ? n : null
}

export function parseCountdownFromSearchParams(searchParams: URLSearchParams): ParseResult {
  const vRaw = searchParams.get('v') ?? `${URL_VERSION}`
  const v = parseIntStrict(vRaw)
  if (v !== URL_VERSION) return { ok: false, error: `Unsupported version: v=${vRaw}` }

  const tRaw = searchParams.get('t')
  if (!tRaw) return { ok: false, error: 'Missing required parameter: t' }
  const t = parseIntStrict(tRaw)
  if (t === null) return { ok: false, error: `Invalid t: ${tRaw}` }
  if (t <= 0) return { ok: false, error: `Invalid t (must be > 0): ${tRaw}` }

  const l = searchParams.get('l') ?? undefined

  const k = searchParams.get('k')
  const iRaw = searchParams.get('i')
  const s = searchParams.get('s')
  const hasAnySigned = k !== null || iRaw !== null || s !== null
  if (!hasAnySigned) return { ok: true, value: { v: URL_VERSION, t, l } }

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

  return { ok: true, value: { v: URL_VERSION, t, l, signed: { k, i, s } } }
}

