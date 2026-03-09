import { describe, expect, it } from 'vitest'
import { breakdownMs, getElapsedMs, getRemainingMs } from './time'

describe('time', () => {
  it('getRemainingMs clamps at zero', () => {
    expect(getRemainingMs(10_000, 8_000)).toBe(2_000)
    expect(getRemainingMs(10_000, 12_000)).toBe(0)
  })

  it('getElapsedMs clamps at zero', () => {
    expect(getElapsedMs(8_000, 10_000)).toBe(2_000)
    expect(getElapsedMs(12_000, 10_000)).toBe(0)
  })

  it('breakdownMs handles day boundaries', () => {
    expect(breakdownMs(90_061_000)).toEqual({
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
    })
  })
})
