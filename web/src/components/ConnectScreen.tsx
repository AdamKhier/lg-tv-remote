import { useState } from 'react'
import { mixedContentRisk, normalizeBase } from '../api'
import type { ConnState } from '../hooks/useRemote'
import { AlertIcon, TvIcon, WifiIcon } from '../icons'
import { PadButton } from './PadButton'
import { ErrorBanner } from './ErrorBanner'

type Props = {
  initialHost: string
  recent: string[]
  state: ConnState
  error: string | null
  onConnect: (host: string) => Promise<boolean>
  onDismissError: () => void
}

export function ConnectScreen({
  initialHost,
  recent,
  state,
  error,
  onConnect,
  onDismissError,
}: Props) {
  const [host, setHost] = useState(initialHost)
  const busy = state === 'connecting'
  const target = normalizeBase(host)
  const showMixedWarning = Boolean(target) && mixedContentRisk(target)

  const submit = async () => {
    if (!host.trim() || busy) return
    await onConnect(host)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-7 flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-accent-400/25 bg-accent-500/10 text-accent-300">
          <TvIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">IR Bridge Remote</h1>
          <p className="text-xs text-mist-500">Wi-Fi control for your LG TV via ESP32</p>
        </div>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="block">
          <span className="label">Bridge address</span>
          <div className="mt-1.5 flex gap-2">
            <input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="192.168.1.50 or tvremote.local"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className="focusable h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-900/80 px-3 font-mono text-sm text-mist-100 placeholder:text-mist-500/70"
            />
            <PadButton
              type="submit"
              variant="accent"
              className="h-11 shrink-0 px-5 text-sm"
              disabled={busy || !host.trim()}
            >
              {busy ? '…' : 'Connect'}
            </PadButton>
          </div>
        </label>
      </form>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} onDismiss={onDismissError} />
        </div>
      ) : null}

      {showMixedWarning ? (
        <div className="mt-3 flex gap-3 rounded-2xl border border-ember-500/25 bg-ember-500/10 px-3.5 py-3 text-xs leading-relaxed text-ember-400">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">This page is https, the bridge is http.</p>
            <p className="mt-1 text-ember-400/80">
              Chrome can reach it after you allow local-network access. Safari and iOS will refuse —
              serve this app over http instead (run{' '}
              <code className="rounded bg-black/30 px-1">npm run dev -- --host</code> on your computer
              and open that address on your phone).
            </p>
          </div>
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="mt-5">
          <span className="label">Recent</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {recent.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  setHost(entry)
                  void onConnect(entry)
                }}
                className="key focusable rounded-full px-3 py-1.5 font-mono text-xs"
              >
                {entry}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
        <p className="flex items-center gap-2 text-xs font-medium text-mist-300">
          <WifiIcon className="h-4 w-4 text-accent-400" />
          Finding the bridge
        </p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-mist-500">
          <li>• The ESP32 prints its address over serial at 115200 baud on boot.</li>
          <li>• It also answers at http://tvremote.local on most home networks.</li>
          <li>
            • Never joined Wi-Fi? It opens a hotspot named <code>tvremote</code> (password{' '}
            <code>tvremote1234</code>) — join it and connect to 192.168.4.1.
          </li>
          <li>• Wiring and flashing steps are in the project README.</li>
        </ul>
      </div>
    </div>
  )
}
