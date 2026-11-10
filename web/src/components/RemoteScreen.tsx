import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ConnState } from '../hooks/useRemote'
import type { RemoteKey, StatusResponse } from '../types'
import {
  BackIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExitIcon,
  GridIcon,
  HashIcon,
  HomeIcon,
  InfoIcon,
  InputIcon,
  MuteIcon,
  PaletteIcon,
  PowerIcon,
  RefreshIcon,
  SettingsIcon,
  TvIcon,
  VolumeDownIcon,
  VolumeUpIcon,
} from '../icons'
import { Dpad } from './Dpad'
import { HoldButton, IconLabel, PadButton } from './PadButton'
import { ErrorBanner } from './ErrorBanner'

type Props = {
  base: string
  status: StatusResponse | null
  state: ConnState
  keys: RemoteKey[]
  error: string | null
  onSend: (id: string) => void
  onLearn: (key: RemoteKey) => void
  onOpenSettings: () => void
  onRefresh: () => void
  onDismissError: () => void
}

const DOT: Record<ConnState, string> = {
  online: 'bg-accent-400 shadow-[0_0_10px] shadow-accent-500/70',
  connecting: 'bg-ember-400 animate-pulse',
  offline: 'bg-rose-400',
  idle: 'bg-mist-500',
}

const DIGIT_ORDER = [
  'num_1',
  'num_2',
  'num_3',
  'num_4',
  'num_5',
  'num_6',
  'num_7',
  'num_8',
  'num_9',
  'num_0',
]

const COLOR_SWATCH: Record<string, string> = {
  color_red: '#ef4444',
  color_green: '#22c55e',
  color_yellow: '#eab308',
  color_blue: '#3b82f6',
}

type Tab = 'keypad' | 'colors' | 'apps'

const TABS: { id: Tab; label: string; icon: typeof HashIcon }[] = [
  { id: 'keypad', label: 'Keypad', icon: HashIcon },
  { id: 'colors', label: 'Colour', icon: PaletteIcon },
  { id: 'apps', label: 'Apps', icon: GridIcon },
]

const KEYBOARD_MAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  Backspace: 'back',
  h: 'home',
  i: 'input',
  m: 'mute',
  p: 'power',
  '+': 'vol_up',
  '=': 'vol_up',
  '-': 'vol_down',
}

export function RemoteScreen({
  base,
  status,
  state,
  keys,
  error,
  onSend,
  onLearn,
  onOpenSettings,
  onRefresh,
  onDismissError,
}: Props) {
  const [tab, setTab] = useState<Tab>('keypad')

  const byId = useMemo(() => new Map(keys.map((k) => [k.id, k])), [keys])
  const digits = DIGIT_ORDER.map((id) => byId.get(id)).filter((k): k is RemoteKey => Boolean(k))
  const colors = Object.keys(COLOR_SWATCH)
    .map((id) => byId.get(id))
    .filter((k): k is RemoteKey => Boolean(k))
  const apps = keys.filter((k) => k.group === 'apps')
  const ready = keys.filter((k) => k.code).length

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const id = KEYBOARD_MAP[event.key]
      if (!id) return
      event.preventDefault()
      onSend(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSend])

  const subline =
    state === 'online'
      ? `fw ${status?.fw ?? '–'} · ${ready}/${keys.length} buttons mapped`
      : state === 'connecting'
        ? 'connecting…'
        : 'bridge offline'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10">
      <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-white/5 bg-ink-950/75 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent-400/25 bg-accent-500/10 text-accent-300">
            <TvIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[state]}`} />
              <span className="truncate font-mono text-sm text-mist-100">
                {base.replace(/^https?:\/\//, '')}
              </span>
            </div>
            <p className="truncate text-[11px] text-mist-500">{subline}</p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh connection"
            className="key focusable h-9 w-9 rounded-full"
          >
            <RefreshIcon className={`h-4 w-4 ${state === 'connecting' ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="key focusable h-9 w-9 rounded-full"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error ? <ErrorBanner message={error} onRetry={onRefresh} onDismiss={onDismissError} /> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <PadButton
              onClick={() => onSend('power')}
              variant="power"
              className="h-14"
              aria-label="Power"
            >
              <IconLabel icon={<PowerIcon className="h-5 w-5" />} label="Power" />
            </PadButton>
            <PadButton
              onClick={() => onSend('input')}
              className="h-14 w-16"
              aria-label="Input source"
            >
              <IconLabel icon={<InputIcon className="h-5 w-5" />} label="Input" />
            </PadButton>
            <PadButton onClick={() => onSend('info')} className="h-14 w-16" aria-label="Info">
              <IconLabel icon={<InfoIcon className="h-5 w-5" />} label="Info" />
            </PadButton>
          </div>

          <Dpad onSend={onSend} />

          <div className="grid grid-cols-3 gap-2">
            <PadButton onClick={() => onSend('back')} className="h-14" aria-label="Back">
              <IconLabel icon={<BackIcon className="h-5 w-5" />} label="Back" />
            </PadButton>
            <PadButton onClick={() => onSend('home')} className="h-14" aria-label="Home">
              <IconLabel icon={<HomeIcon className="h-5 w-5" />} label="Home" />
            </PadButton>
            <PadButton onClick={() => onSend('exit')} className="h-14" aria-label="Exit">
              <IconLabel icon={<ExitIcon className="h-5 w-5" />} label="Exit" />
            </PadButton>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Rocker
              label="Vol"
              up={{ id: 'vol_up', icon: <VolumeUpIcon className="h-5 w-5" /> }}
              down={{ id: 'vol_down', icon: <VolumeDownIcon className="h-5 w-5" /> }}
              onSend={onSend}
            />
            <PadButton
              onClick={() => onSend('mute')}
              className="h-16 w-16 rounded-full"
              aria-label="Mute"
            >
              <MuteIcon className="h-5 w-5" />
            </PadButton>
            <Rocker
              label="Ch"
              up={{ id: 'ch_up', icon: <ChevronUpIcon className="h-5 w-5" /> }}
              down={{ id: 'ch_down', icon: <ChevronDownIcon className="h-5 w-5" /> }}
              onSend={onSend}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-ink-900/70 p-1">
            {TABS.map(({ id, label, icon: TabIcon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`focusable flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors ${
                  tab === id
                    ? 'bg-ink-700 text-mist-100 shadow-sm'
                    : 'text-mist-500 hover:text-mist-300'
                }`}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <section className="panel p-3">
            {tab === 'keypad' ? (
              <div className="grid grid-cols-3 gap-2">
                {digits.map((key) => (
                  <PadButton
                    key={key.id}
                    onClick={() => onSend(key.id)}
                    unlearned={!key.code}
                    className={`h-14 text-lg font-medium ${
                      key.id === 'num_0' ? 'col-start-2' : ''
                    }`}
                    aria-label={`Digit ${key.label}`}
                  >
                    {key.label}
                  </PadButton>
                ))}
              </div>
            ) : null}

            {tab === 'colors' ? (
              <div className="grid grid-cols-2 gap-2">
                {colors.map((key) => (
                  <PadButton
                    key={key.id}
                    onClick={() => onSend(key.id)}
                    unlearned={!key.code}
                    className="h-16 justify-start gap-3 px-4"
                  >
                    <span
                      className="h-4 w-4 rounded-full ring-1 ring-white/30"
                      style={{ background: COLOR_SWATCH[key.id] }}
                    />
                    <span className="text-sm">{key.label}</span>
                  </PadButton>
                ))}
              </div>
            ) : null}

            {tab === 'apps' ? (
              <div className="grid grid-cols-2 gap-2">
                {apps.map((key) => (
                  <PadButton
                    key={key.id}
                    onClick={() => (key.code ? onSend(key.id) : onLearn(key))}
                    unlearned={!key.code}
                    className="h-20 flex-col items-start justify-center gap-0.5 px-3 text-left"
                  >
                    <span className="text-sm font-medium">{key.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-mist-500">
                      {key.code ? (key.learned ? 'learned' : 'built-in') : 'tap to teach'}
                    </span>
                  </PadButton>
                ))}
              </div>
            ) : null}
          </section>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-mist-500">
            <p>
              Keep the IR LED pointed at the TV — it needs line of sight to the sensor, roughly
              where the TV's own remote aims.
            </p>
            <p className="mt-2 hidden lg:block">
              Keyboard: arrows move, Enter is OK, Backspace is Back, Escape is Exit, H home, I
              input, M mute, P power, +/− volume.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

type RockerProps = {
  label: string
  up: { id: string; icon: ReactNode }
  down: { id: string; icon: ReactNode }
  onSend: (id: string) => void
}

function Rocker({ label, up, down, onSend }: RockerProps) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-2">
      <HoldButton
        onFire={() => onSend(up.id)}
        aria-label={`${label} up`}
        className="h-14 w-full rounded-xl"
      >
        {up.icon}
      </HoldButton>
      <span className="label select-none py-0.5">{label}</span>
      <HoldButton
        onFire={() => onSend(down.id)}
        aria-label={`${label} down`}
        className="h-14 w-full rounded-xl"
      >
        {down.icon}
      </HoldButton>
    </div>
  )
}
