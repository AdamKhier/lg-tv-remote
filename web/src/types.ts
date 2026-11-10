export type KeyGroup = 'power' | 'volume' | 'channel' | 'nav' | 'digits' | 'colors' | 'apps'

export interface RemoteKey {
  id: string
  label: string
  group: KeyGroup
  /** Full 32-bit NEC frame as hex, or null when nothing is mapped yet. */
  code: string | null
  learned: boolean
  builtin: boolean
}

export interface CodesResponse {
  ok: boolean
  profile: string
  protocol: string
  bits: number
  address: string
  keys: RemoteKey[]
}

export interface LearnState {
  active: boolean
  keyId: string
  captured: boolean
  code: string | null
  remainingMs: number
  error: string | null
}

export interface StatusResponse {
  ok: boolean
  device: string
  fw: string
  ip: string
  mdns: string
  protocol: string
  bits: number
  address: string
  hasReceiver: boolean
  rssi: number | null
  uptimeMs: number
  learn: LearnState
}

export interface KeyResponse {
  ok: boolean
  id: string
  code: string
  repeats: number
}
