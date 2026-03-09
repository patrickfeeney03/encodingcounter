import { breakdownMs, getElapsedMs, getRemainingMs, pad2 } from '../lib/time'
import type { CountdownMode } from '../lib/urlState'

type Props = {
  label?: string
  mode: CountdownMode
  nowMs: number
  targetMs: number
}

export default function TimerSummary(props: Props) {
  const isElapsed = props.mode === 'elapsed'
  const durationMs = isElapsed
    ? getElapsedMs(props.targetMs, props.nowMs)
    : getRemainingMs(props.targetMs, props.nowMs)
  const parts = breakdownMs(durationMs)
  const targetDate = new Date(props.targetMs)
  const title = props.label ? props.label : isElapsed ? 'Time Since' : 'Countdown'

  return (
    <>
      <h1>{title}</h1>

      <div className="countdown">
        <div className="bigTime">
          <span className="days">{parts.days}d</span>
          <span className="hms">
            {pad2(parts.hours)}:{pad2(parts.minutes)}:{pad2(parts.seconds)}
          </span>
        </div>
        <div className="muted">
          {isElapsed ? 'Since' : 'Target'}: {targetDate.toLocaleString()} ({targetDate.toISOString()})
        </div>
      </div>
    </>
  )
}
