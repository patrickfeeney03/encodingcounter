import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_PAST_STATUS,
  ELAPSED_FUTURE_STATUS,
  INVALID_DATETIME_STATUS,
  getMinuteStartMs,
  getSetupValidationWarning,
} from './setupValidation'

describe('setupValidation', () => {
  it('returns invalid-date warning when target time is missing', () => {
    expect(
      getSetupValidationWarning({
        mode: 'countdown',
        nowMs: 1_700_000_000_000,
        targetMs: null,
      }),
    ).toBe(INVALID_DATETIME_STATUS)
  })

  it('blocks countdown dates earlier than the current minute', () => {
    const nowMs = Date.UTC(2026, 2, 9, 12, 34, 45)

    expect(
      getSetupValidationWarning({
        mode: 'countdown',
        nowMs,
        targetMs: Date.UTC(2026, 2, 9, 12, 33, 59),
      }),
    ).toBe(COUNTDOWN_PAST_STATUS)
  })

  it('allows countdown dates within the current minute', () => {
    const nowMs = Date.UTC(2026, 2, 9, 12, 34, 45)

    expect(
      getSetupValidationWarning({
        mode: 'countdown',
        nowMs,
        targetMs: Date.UTC(2026, 2, 9, 12, 34, 0),
      }),
    ).toBeNull()
  })

  it('blocks elapsed dates in the future', () => {
    const nowMs = Date.UTC(2026, 2, 9, 12, 34, 45)

    expect(
      getSetupValidationWarning({
        mode: 'elapsed',
        nowMs,
        targetMs: Date.UTC(2026, 2, 9, 12, 35, 0),
      }),
    ).toBe(ELAPSED_FUTURE_STATUS)
  })

  it('allows elapsed dates in the past', () => {
    const nowMs = Date.UTC(2026, 2, 9, 12, 34, 45)

    expect(
      getSetupValidationWarning({
        mode: 'elapsed',
        nowMs,
        targetMs: Date.UTC(2026, 2, 9, 12, 34, 0),
      }),
    ).toBeNull()
  })

  it('rounds down to the start of the current minute', () => {
    expect(getMinuteStartMs(Date.UTC(2026, 2, 9, 12, 34, 45, 900))).toBe(Date.UTC(2026, 2, 9, 12, 34, 0, 0))
  })
})
