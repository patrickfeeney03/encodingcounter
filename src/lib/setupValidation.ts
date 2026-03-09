import { getElapsedMs } from './time'
import type { CountdownMode, TimerItem } from './urlState'

export const INVALID_DATETIME_STATUS = 'Please choose a valid date/time.'
export const COUNTDOWN_PAST_STATUS = 'Countdown links require the current time or a future date/time.'
export const ELAPSED_FUTURE_STATUS = 'Time Since links require a past date/time.'

export type TimerDraft = {
  mode: CountdownMode
  paused: boolean
  targetMs: number | null
  label?: string
}

export function getMinuteStartMs(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000
}

export function getSetupValidationWarning(input: {
  mode: CountdownMode
  nowMs: number
  targetMs: number | null
}): string | null {
  if (input.targetMs === null) return INVALID_DATETIME_STATUS
  if (input.mode === 'countdown' && input.targetMs < getMinuteStartMs(input.nowMs)) {
    return COUNTDOWN_PAST_STATUS
  }
  if (input.mode === 'elapsed' && input.targetMs > input.nowMs) {
    return ELAPSED_FUTURE_STATUS
  }
  return null
}

export function buildTimerItemFromDraft(draft: TimerDraft, nowMs: number): TimerItem {
  const warning = getSetupValidationWarning({
    mode: draft.mode,
    nowMs,
    targetMs: draft.targetMs,
  })
  if (warning) throw new Error(warning)

  const label = draft.label && draft.label.length > 0 ? draft.label : undefined
  if (draft.mode === 'countdown') {
    return { mode: 'countdown', targetMs: draft.targetMs!, label }
  }
  if (draft.paused) {
    return {
      mode: 'paused',
      durationMs: getElapsedMs(draft.targetMs!, nowMs),
      label,
    }
  }
  return { mode: 'elapsed', targetMs: draft.targetMs!, label }
}
