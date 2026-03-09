import { describe, expect, it } from 'vitest'
import {
  buildTimerItemFromDraft,
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

  it('builds a live elapsed item from a valid draft', () => {
    const nowMs = Date.UTC(2026, 2, 9, 12, 34, 45)
    expect(
      buildTimerItemFromDraft(
        {
          mode: 'elapsed',
          paused: false,
          targetMs: Date.UTC(2026, 2, 9, 12, 34, 0),
          label: 'Elapsed',
        },
        nowMs,
      ),
    ).toEqual({
      mode: 'elapsed',
      targetMs: Date.UTC(2026, 2, 9, 12, 34, 0),
      label: 'Elapsed',
    })
  })

  it('builds a paused item by freezing the elapsed duration at generation time', () => {
    const nowMs = Date.UTC(2026, 2, 9, 12, 34, 45)
    expect(
      buildTimerItemFromDraft(
        {
          mode: 'elapsed',
          paused: true,
          targetMs: Date.UTC(2026, 2, 9, 12, 30, 15),
          label: 'Paused',
        },
        nowMs,
      ),
    ).toEqual({
      mode: 'paused',
      durationMs: 270000,
      label: 'Paused',
    })
  })

  it('rounds down to the start of the current minute', () => {
    expect(getMinuteStartMs(Date.UTC(2026, 2, 9, 12, 34, 45, 900))).toBe(Date.UTC(2026, 2, 9, 12, 34, 0, 0))
  })
})
