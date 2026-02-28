export function getRemainingMs(targetMs: number, nowMs: number): number {
  return Math.max(0, targetMs - nowMs)
}

export type TimeParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function breakdownMs(ms: number): TimeParts {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

