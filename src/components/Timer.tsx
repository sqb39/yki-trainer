import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  duration: number
  onComplete?: () => void
  autoStart?: boolean
  label?: string
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Timer({ duration, onComplete, autoStart = false, label }: TimerProps) {
  const [remaining, setRemaining] = useState(duration)
  const [running, setRunning] = useState(autoStart)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    setRemaining(duration)
    setRunning(autoStart)
    completedRef.current = false
  }, [duration, autoStart])

  useEffect(() => {
    if (!running) return

    const id = window.setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (remaining > 0 || completedRef.current) return
    completedRef.current = true
    setRunning(false)
    onCompleteRef.current?.()
  }, [remaining])

  const percent = duration > 0 ? ((duration - remaining) / duration) * 100 : 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
      {label && <p className="mb-2 text-sm text-slate-600">{label}</p>}
      <p className="text-4xl font-bold tabular-nums text-slate-900">{formatTime(remaining)}</p>
      <div className="mx-auto mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {!running && remaining > 0 && (
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Starta
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Pausa
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            completedRef.current = false
            setRemaining(duration)
            setRunning(false)
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Återställ
        </button>
      </div>
    </div>
  )
}
