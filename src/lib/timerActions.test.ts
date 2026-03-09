import { describe, expect, it } from 'vitest'
import { freezeElapsedItemAt } from './timerActions'

describe('timerActions', () => {
  it('freezes a live elapsed item to a paused duration', () => {
    const items = [
      { mode: 'countdown' as const, targetMs: 2_000, label: 'Countdown' },
      { mode: 'elapsed' as const, targetMs: 1_000, label: 'Elapsed' },
    ]

    expect(freezeElapsedItemAt(items, 1, 4_500)).toEqual([
      { mode: 'countdown', targetMs: 2_000, label: 'Countdown' },
      { mode: 'paused', durationMs: 3_500, label: 'Elapsed' },
    ])
  })

  it('throws when trying to freeze a non-elapsed item', () => {
    expect(() =>
      freezeElapsedItemAt([{ mode: 'countdown', targetMs: 2_000 }], 0, 4_500),
    ).toThrow('Only live Time Since timers can be frozen.')
  })
})
