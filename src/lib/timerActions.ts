import { getElapsedMs } from './time'
import type { TimerItem } from './urlState'

export function freezeElapsedItemAt(items: TimerItem[], index: number, nowMs: number): TimerItem[] {
  const item = items[index]
  if (!item || item.mode !== 'elapsed') {
    throw new Error('Only live Time Since timers can be frozen.')
  }

  return items.map((current, currentIndex) =>
    currentIndex === index
      ? {
          mode: 'paused',
          durationMs: getElapsedMs(item.targetMs, nowMs),
          label: item.label,
        }
      : current,
  )
}
