import { useCallback, useEffect, useRef, useState } from 'react'
import { api, DeviceError } from '../api'
import type { RemoteKey } from '../types'
import { CheckIcon, InfoIcon } from '../icons'
import { PadButton } from './PadButton'
import { Sheet } from './Sheet'

type Phase = 'starting' | 'listening' | 'captured' | 'timeout' | 'error' | 'noReceiver'

type Props = {
  base: string
  remoteKey: RemoteKey
  hasReceiver: boolean
  onClose: () => void
  onLearned: () => void
}

const FALLBACK_TIMEOUT = 15000

export function LearnSheet({ base, remoteKey, hasReceiver, onClose, onLearned }: Props) {
  const [phase, setPhase] = useState<Phase>(hasReceiver ? 'starting' : 'noReceiver')
  const [remaining, setRemaining] = useState(FALLBACK_TIMEOUT)
  const [total, setTotal] = useState(FALLBACK_TIMEOUT)
  const [code, setCode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const startedRef = useRef(false)

  const begin = useCallback(async () => {
    setCode(null)
    setMessage(null)
    if (!hasReceiver) {
      setPhase('noReceiver')
      return
    }
    setPhase('starting')
    try {
      const started = await api.learnStart(base, remoteKey.id)
      setTotal(started.timeoutMs)
      setRemaining(started.timeoutMs)
      setPhase('listening')
    } catch (err) {
      setPhase('error')
      setMessage(err instanceof DeviceError ? err.message : 'Could not start learning.')
    }
  }, [base, hasReceiver, remoteKey.id])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void begin()
  }, [begin])

  useEffect(() => {
    if (phase !== 'listening') return
    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const state = await api.learnStatus(base)
          if (cancelled) return
          setRemaining(state.remainingMs)
          if (state.captured && state.code) {
            setCode(state.code)
            setPhase('captured')
            onLearned()
          } else if (!state.active && state.error === 'timeout') {
            setPhase('timeout')
          }
        } catch (err) {
          if (cancelled) return
          setPhase('error')
          setMessage(err instanceof DeviceError ? err.message : 'Lost contact with the bridge.')
        }
      })()
    }, 600)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [base, onLearned, phase])

  const handleClose = useCallback(() => {
    if (phase === 'listening') void api.learnCancel(base).catch(() => undefined)
    onClose()
  }, [base, onClose, phase])

  const testCode = async () => {
    if (!code) return
    setTesting(true)
    try {
      await api.key(base, { code })
    } catch (err) {
      setMessage(err instanceof DeviceError ? err.message : 'Could not send the test code.')
    } finally {
      setTesting(false)
    }
  }

  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const seconds = Math.ceil(remaining / 1000)
  const radius = 44
  const circumference = 2 * Math.PI * radius

  return (
    <Sheet
      title={`Teach “${remoteKey.label}”`}
      subtitle="Copy the code from your TV's own remote"
      onClose={handleClose}
    >
      {phase === 'starting' ? (
        <p className="py-10 text-center text-sm text-mist-400">Arming the IR receiver…</p>
      ) : null}

      {phase === 'listening' ? (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 100 100" className="progress-ring h-32 w-32 -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="6"
                className="stroke-white/10"
              />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                className="stroke-accent-400"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular-nums">{seconds}</span>
              <span className="label">seconds</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-mist-100">
              Point your LG remote at the receiver and press the button you want to copy.
            </p>
            <p className="mt-2 text-xs text-mist-500">
              Held 15–30 cm away, aimed straight at the receiver's window.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-mist-500 underline underline-offset-4 hover:text-mist-300"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {phase === 'captured' && code ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full border border-accent-400/30 bg-accent-500/15 text-accent-300">
            <CheckIcon className="h-7 w-7" />
          </span>
          <div>
            <p className="text-sm text-mist-100">Code captured and saved on the bridge.</p>
            <p className="mt-2 font-mono text-lg tracking-widest text-accent-300">{code}</p>
          </div>
          {message ? <p className="text-xs text-rose-300">{message}</p> : null}
          <div className="grid w-full grid-cols-2 gap-2">
            <PadButton onClick={() => void testCode()} disabled={testing} className="h-11">
              {testing ? 'Sending…' : 'Test on TV'}
            </PadButton>
            <PadButton onClick={handleClose} variant="accent" className="h-11">
              Done
            </PadButton>
          </div>
          <button
            type="button"
            onClick={() => void begin()}
            className="text-xs text-mist-500 underline underline-offset-4 hover:text-mist-300"
          >
            Learn it again
          </button>
        </div>
      ) : null}

      {phase === 'timeout' ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-mist-100">Nothing arrived in time.</p>
          <ul className="mx-auto max-w-sm space-y-1.5 text-left text-xs leading-relaxed text-mist-400">
            <li>• Is the TSOP receiver wired to GPIO 5 (OUT), 3V3 and GND?</li>
            <li>• Aim the remote at the receiver, not at the TV.</li>
            <li>• Some remotes need a firm press — try a different button first.</li>
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <PadButton onClick={handleClose} className="h-11">
              Close
            </PadButton>
            <PadButton onClick={() => void begin()} variant="accent" className="h-11">
              Try again
            </PadButton>
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-rose-200">{message ?? 'Something went wrong.'}</p>
          <div className="grid grid-cols-2 gap-2">
            <PadButton onClick={handleClose} className="h-11">
              Close
            </PadButton>
            <PadButton onClick={() => void begin()} variant="accent" className="h-11">
              Try again
            </PadButton>
          </div>
        </div>
      ) : null}

      {phase === 'noReceiver' ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl border border-ember-500/25 bg-ember-500/10 px-3.5 py-3 text-sm text-ember-400">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>This bridge was flashed without an IR receiver, so it can only send.</p>
          </div>
          <ol className="space-y-2 text-xs leading-relaxed text-mist-300">
            <li>
              1. Wire a TSOP38238 receiver: OUT → GPIO 5, VCC → 3V3, GND → GND.
            </li>
            <li>
              2. In the sketch, set <code className="rounded bg-white/10 px-1">#define IR_RECEIVER_ENABLED 1</code>.
            </li>
            <li>3. Re-flash the ESP32 and reopen this dialog.</li>
          </ol>
          <p className="text-xs text-mist-500">
            Every button in the shipped LG table still works without a receiver — you only need one
            to copy extra buttons like the app shortcuts.
          </p>
          <PadButton onClick={handleClose} className="h-11 w-full">
            Got it
          </PadButton>
        </div>
      ) : null}

      {phase === 'captured' ? (
        <p className="mt-4 text-[11px] leading-relaxed text-mist-500">
          Codes are stored in the ESP32's flash, so they survive re-flashing the board.
        </p>
      ) : null}
    </Sheet>
  )
}
