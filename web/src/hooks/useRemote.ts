import { useCallback, useEffect, useRef, useState } from 'react'
import { api, DeviceError, normalizeBase } from '../api'
import type { RemoteKey, StatusResponse } from '../types'

const HOST_KEY = 'lgremote.host'
const RECENT_KEY = 'lgremote.recent'

export type ConnState = 'idle' | 'connecting' | 'online' | 'offline'
export type SendResult = 'ok' | 'unlearned' | 'failed'

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function rememberHost(host: string) {
  const next = [host, ...readRecent().filter((h) => h !== host)].slice(0, 4)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage full or blocked — not fatal */
  }
  return next
}

export function useRemote() {
  const [host, setHost] = useState<string>(() => localStorage.getItem(HOST_KEY) ?? '')
  const [base, setBase] = useState('')
  const [state, setState] = useState<ConnState>('idle')
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [keys, setKeys] = useState<RemoteKey[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastKeyId, setLastKeyId] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>(readRecent)

  const baseRef = useRef('')

  const connect = useCallback(async (raw: string): Promise<boolean> => {
    const normalized = normalizeBase(raw)
    setState('connecting')
    setError(null)

    if (!normalized) {
      setState('offline')
      setError('That does not look like an address. Try 192.168.1.50 or tvremote.local')
      return false
    }

    try {
      const [nextStatus, nextCodes] = await Promise.all([
        api.status(normalized),
        api.codes(normalized),
      ])
      baseRef.current = normalized
      setBase(normalized)
      setStatus(nextStatus)
      setKeys(nextCodes.keys)
      setState('online')
      setHost(raw.trim())
      localStorage.setItem(HOST_KEY, raw.trim())
      setRecent(rememberHost(raw.trim()))
      return true
    } catch (err) {
      baseRef.current = ''
      setBase('')
      setStatus(null)
      setKeys([])
      setState('offline')
      setError(err instanceof DeviceError ? err.message : 'Could not reach the bridge.')
      return false
    }
  }, [])

  const refresh = useCallback(async () => {
    const target = baseRef.current
    if (!target) return
    try {
      const nextStatus = await api.status(target)
      setStatus(nextStatus)
      setState('online')
    } catch (err) {
      if (err instanceof DeviceError) {
        if (err.kind === 'network') setState('offline')
        setError(err.message)
      }
    }
  }, [])

  const reloadCodes = useCallback(async () => {
    const target = baseRef.current
    if (!target) return
    try {
      const nextCodes = await api.codes(target)
      setKeys(nextCodes.keys)
    } catch {
      /* connection problems are reported by the status poll */
    }
  }, [])

  const send = useCallback(async (id: string, repeat = 0): Promise<SendResult> => {
    const target = baseRef.current
    if (!target) return 'failed'
    try {
      await api.key(target, { id, repeat })
      setLastKeyId(id)
      setState((prev) => (prev === 'offline' ? 'online' : prev))
      setError(null)
      return 'ok'
    } catch (err) {
      if (err instanceof DeviceError) {
        if (err.code === 'key_not_learned') return 'unlearned'
        if (err.kind === 'network') setState('offline')
        setError(err.message)
      }
      return 'failed'
    }
  }, [])

  const disconnect = useCallback(() => {
    baseRef.current = ''
    setBase('')
    setStatus(null)
    setKeys([])
    setState('idle')
    setError(null)
    setLastKeyId(null)
    localStorage.removeItem(HOST_KEY)
  }, [])

  return {
    host,
    base,
    state,
    status,
    keys,
    error,
    lastKeyId,
    recent,
    connect,
    refresh,
    reloadCodes,
    send,
    disconnect,
    clearError: () => setError(null),
  }
}

export type RemoteController = ReturnType<typeof useRemote>

/** Fires once on press, then repeats while held — how a real rocker behaves. */
export function useHoldRepeat(options: {
  onTick: () => void
  enabled?: boolean
  delay?: number
  interval?: number
}) {
  const { enabled = true, delay = 420, interval = 130 } = options
  const tickRef = useRef(options.onTick)
  const timers = useRef<{ delay?: number; repeat?: number }>({})

  useEffect(() => {
    tickRef.current = options.onTick
  }, [options.onTick])

  const stop = useCallback(() => {
    if (timers.current.delay !== undefined) window.clearTimeout(timers.current.delay)
    if (timers.current.repeat !== undefined) window.clearInterval(timers.current.repeat)
    timers.current = {}
  }, [])

  useEffect(() => stop, [stop])

  const start = useCallback(() => {
    if (!enabled) return
    stop()
    tickRef.current()
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => tickRef.current(), interval)
    }, delay)
  }, [delay, enabled, interval, stop])

  return {
    onPointerDown: (event: { preventDefault: () => void }) => {
      event.preventDefault()
      start()
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  }
}
