import { useState } from 'react'
import { api, DeviceError, mixedContentRisk } from '../api'
import type { RemoteKey, StatusResponse } from '../types'
import { AlertIcon, ArrowLeftIcon, PencilIcon, RefreshIcon, TrashIcon } from '../icons'
import { PadButton } from './PadButton'
import { Sheet } from './Sheet'

type Props = {
  base: string
  status: StatusResponse | null
  keys: RemoteKey[]
  onClose: () => void
  onChangeDevice: () => void
  onReload: () => void
  onLearn: (key: RemoteKey) => void
}

function formatUptime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

export function SettingsSheet({
  base,
  status,
  keys,
  onClose,
  onChangeDevice,
  onReload,
  onLearn,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const learnedCount = keys.filter((key) => key.learned).length

  const clearOne = async (key: RemoteKey) => {
    setBusyId(key.id)
    setMessage(null)
    try {
      await api.resetCodes(base, key.id)
      onReload()
    } catch (err) {
      setMessage(err instanceof DeviceError ? err.message : 'Could not clear that code.')
    } finally {
      setBusyId(null)
    }
  }

  const clearAll = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true)
      return
    }
    setBusyId('all')
    setMessage(null)
    try {
      const result = await api.resetCodes(base, 'all')
      setMessage(`Cleared ${result.cleared} learned ${result.cleared === 1 ? 'code' : 'codes'}.`)
      onReload()
    } catch (err) {
      setMessage(err instanceof DeviceError ? err.message : 'Could not clear the codes.')
    } finally {
      setBusyId(null)
      setConfirmWipe(false)
    }
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Address', value: status?.ip ?? base.replace(/^https?:\/\//, '') },
    { label: 'Firmware', value: status?.fw ?? '—' },
    { label: 'Profile', value: `${status?.protocol ?? 'NEC'} · ${status?.address ?? '0x20'}` },
    {
      label: 'Signal',
      value: status?.rssi != null ? `${status.rssi} dBm` : '—',
    },
    { label: 'IR receiver', value: status?.hasReceiver ? 'fitted' : 'not fitted' },
    { label: 'Uptime', value: status ? formatUptime(status.uptimeMs) : '—' },
  ]

  return (
    <Sheet title="Settings" subtitle={base.replace(/^https?:\/\//, '')} onClose={onClose}>
      <div className="space-y-5">
        <section>
          <span className="label">Bridge</span>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <dt className="text-[10px] uppercase tracking-wider text-mist-500">{row.label}</dt>
                <dd className="mt-0.5 truncate text-sm text-mist-100">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PadButton onClick={onReload} className="h-10 gap-2 text-xs">
              <RefreshIcon className="h-3.5 w-3.5" />
              Refresh
            </PadButton>
            <PadButton onClick={onChangeDevice} className="h-10 gap-2 text-xs">
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Change device
            </PadButton>
          </div>
        </section>

        {mixedContentRisk(base) ? (
          <div className="flex gap-3 rounded-2xl border border-ember-500/25 bg-ember-500/10 px-3.5 py-3 text-xs leading-relaxed text-ember-400">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This app is running over https while the bridge is http. Chrome is fine once you grant
              local-network access; iOS will need the app served over http on your network.
            </p>
          </div>
        ) : null}

        <section>
          <div className="flex items-baseline justify-between">
            <span className="label">Button mappings</span>
            <span className="text-[11px] text-mist-500">
              {keys.length} buttons · {learnedCount} learned
            </span>
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/5">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-mist-100">{key.label}</p>
                  <p className="font-mono text-[10px] text-mist-500">
                    {key.code ?? 'no code yet'}
                    {key.learned ? ' · learned' : key.builtin ? '' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLearn(key)}
                  aria-label={`Teach ${key.label}`}
                  className="key focusable h-7 w-7 rounded-full"
                >
                  <PencilIcon className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void clearOne(key)}
                  disabled={!key.learned || busyId === key.id}
                  aria-label={`Clear ${key.label}`}
                  className="key focusable h-7 w-7 rounded-full disabled:opacity-30"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mist-500">
            Learned codes live on the ESP32 and override the built-in table. Clearing one restores
            the shipped code where there is one.
          </p>
        </section>

        {message ? <p className="text-xs text-accent-300">{message}</p> : null}

        <section className="border-t border-white/5 pt-4">
          <PadButton
            onClick={() => void clearAll()}
            variant={confirmWipe ? 'power' : 'ghost'}
            className="h-10 w-full gap-2 text-xs"
            disabled={busyId === 'all' || learnedCount === 0}
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {confirmWipe ? 'Tap again to erase all learned codes' : 'Erase all learned codes'}
          </PadButton>
          <button
            type="button"
            onClick={onChangeDevice}
            className="mt-3 w-full text-[11px] text-mist-500 underline underline-offset-4 hover:text-mist-300"
          >
            Forget this bridge and enter a new address
          </button>
        </section>
      </div>
    </Sheet>
  )
}
