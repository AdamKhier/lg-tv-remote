import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectScreen } from './components/ConnectScreen'
import { LearnSheet } from './components/LearnSheet'
import { RemoteScreen } from './components/RemoteScreen'
import { SettingsSheet } from './components/SettingsSheet'
import { useRemote } from './hooks/useRemote'
import type { RemoteKey } from './types'

const HOST_KEY = 'lgremote.host'

export default function App() {
  const remote = useRemote()
  const { connect, refresh, reloadCodes, send, disconnect } = remote

  const [view, setView] = useState<'connect' | 'remote'>(() =>
    localStorage.getItem(HOST_KEY) ? 'remote' : 'connect',
  )
  const [learnKey, setLearnKey] = useState<RemoteKey | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const bootstrapped = useRef(false)

  // Reconnect to the last bridge on load.
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    const stored = localStorage.getItem(HOST_KEY)
    if (!stored) return
    void connect(stored).then((ok) => {
      if (ok) setView('remote')
    })
  }, [connect])

  // Keep the header's liveness and learn state honest.
  useEffect(() => {
    if (remote.state !== 'online') return
    const timer = window.setInterval(() => void refresh(), 20000)
    return () => window.clearInterval(timer)
  }, [remote.state, refresh])

  const handleSend = useCallback(
    (id: string) => {
      void send(id).then((result) => {
        if (result !== 'unlearned') return
        const key = remote.keys.find((entry) => entry.id === id)
        if (key) setLearnKey(key)
      })
    },
    [remote.keys, send],
  )

  const handleLearned = useCallback(() => {
    void reloadCodes()
    void refresh()
  }, [reloadCodes, refresh])

  const handleChangeDevice = useCallback(() => {
    disconnect()
    setSettingsOpen(false)
    setLearnKey(null)
    setView('connect')
  }, [disconnect])

  if (view !== 'remote' || remote.keys.length === 0 || !remote.base) {
    return (
      <ConnectScreen
        initialHost={remote.host}
        recent={remote.recent}
        state={remote.state}
        error={remote.error}
        onConnect={async (value) => {
          const ok = await connect(value)
          if (ok) setView('remote')
          return ok
        }}
        onDismissError={remote.clearError}
      />
    )
  }

  return (
    <>
      <RemoteScreen
        base={remote.base}
        status={remote.status}
        state={remote.state}
        keys={remote.keys}
        error={remote.error}
        onSend={handleSend}
        onLearn={(key) => setLearnKey(key)}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => void refresh()}
        onDismissError={remote.clearError}
      />

      {settingsOpen ? (
        <SettingsSheet
          base={remote.base}
          status={remote.status}
          keys={remote.keys}
          onClose={() => setSettingsOpen(false)}
          onChangeDevice={handleChangeDevice}
          onReload={() => {
            void reloadCodes()
            void refresh()
          }}
          onLearn={(key) => {
            setSettingsOpen(false)
            setLearnKey(key)
          }}
        />
      ) : null}

      {learnKey ? (
        <LearnSheet
          base={remote.base}
          remoteKey={learnKey}
          hasReceiver={Boolean(remote.status?.hasReceiver)}
          onClose={() => setLearnKey(null)}
          onLearned={handleLearned}
        />
      ) : null}
    </>
  )
}
