import type { CodesResponse, KeyResponse, LearnState, StatusResponse } from './types'

const TIMEOUT_MS = 6000

export type DeviceErrorKind = 'network' | 'http' | 'protocol'

export class DeviceError extends Error {
  readonly kind: DeviceErrorKind
  readonly code?: string
  readonly status?: number

  constructor(message: string, kind: DeviceErrorKind, extra?: { code?: string; status?: number }) {
    super(message)
    this.name = 'DeviceError'
    this.kind = kind
    this.code = extra?.code
    this.status = extra?.status
  }
}

/** Turns "192.168.1.50" or "tvremote.local/" into a clean origin. */
export function normalizeBase(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withScheme)
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

function hostnameOf(base: string): string {
  try {
    return new URL(base).hostname
  } catch {
    return ''
  }
}

/** True for addresses a browser treats as "local network" rather than loopback. */
export function isLanHost(base: string): boolean {
  const host = hostnameOf(base)
  if (!host) return false
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return false
  if (host.endsWith('.local')) return true
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true
  return false
}

/**
 * An https:// page may not fetch a plain-http LAN device. Chrome 142+ can ask
 * the user for local-network permission; Safari and Firefox cannot be talked
 * into it, so those users need the app served over http on the LAN.
 */
export function mixedContentRisk(base: string): boolean {
  return (
    typeof location !== 'undefined' &&
    location.protocol === 'https:' &&
    base.startsWith('http://') &&
    isLanHost(base)
  )
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function networkMessage(base: string): string {
  if (mixedContentRisk(base)) {
    return 'Your browser blocked this page from reaching a plain-HTTP device (mixed content). Open the app over http:// on your network, or use Chrome and allow local-network access.'
  }
  return `No answer from ${base}. Check the ESP32 is powered, joined to the same WiFi, and that the address is correct.`
}

function httpMessage(status: number, code?: string): string {
  switch (code) {
    case 'key_not_learned':
      return 'That button has no code yet — teach it from your TV remote first.'
    case 'no_receiver':
      return 'This firmware build has no IR receiver enabled, so it cannot learn codes.'
    case 'unknown_key':
      return 'The bridge does not know that button.'
    case 'bad_code':
      return 'That IR code was not valid hex.'
    default:
      return `The bridge answered with HTTP ${status}.`
  }
}

type RequestOptions = {
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(base: string, path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined
  const init = {
    method: hasBody ? 'POST' : 'GET',
    mode: 'cors' as const,
    credentials: 'omit' as const,
    cache: 'no-store' as const,
    signal: options.signal ?? timeoutSignal(TIMEOUT_MS),
    // Chrome's Local Network Access hint. The value must match the target:
    // 'local' means loopback, 'private' means an RFC1918 LAN address such as
    // 192.168.x.x. Mismatching them makes Chrome reject the request outright
    // ("target IP address space of unknown yet the resource is in private").
    // Unknown keys are ignored by other browsers.
    targetAddressSpace: isLanHost(base) ? 'private' : 'local',
    ...(hasBody
      ? { body: JSON.stringify(options.body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, init as RequestInit)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new DeviceError(`${base} did not answer in time.`, 'network')
    }
    throw new DeviceError(networkMessage(base), 'network')
  }

  const text = await response.text().catch(() => '')
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : undefined
    throw new DeviceError(httpMessage(response.status, code), 'http', { code, status: response.status })
  }

  if (payload === null) {
    throw new DeviceError(
      `${base} replied with something this app could not read. Is that really the IR bridge?`,
      'protocol',
    )
  }

  return payload as T
}

export const api = {
  status: (base: string, signal?: AbortSignal) =>
    request<StatusResponse>(base, '/api/status', { signal }),
  codes: (base: string) => request<CodesResponse>(base, '/api/codes'),
  key: (base: string, payload: { id?: string; code?: string; repeat?: number }) =>
    request<KeyResponse>(base, '/api/key', { body: { repeat: 0, ...payload } }),
  learnStart: (base: string, id: string) =>
    request<{ ok: boolean; keyId: string; timeoutMs: number }>(base, '/api/learn/start', {
      body: { id },
    }),
  learnStatus: (base: string) => request<{ ok: boolean } & LearnState>(base, '/api/learn/status'),
  learnCancel: (base: string) => request<{ ok: boolean } & LearnState>(base, '/api/learn/cancel', { body: {} }),
  resetCodes: (base: string, id: string) =>
    request<{ ok: boolean; cleared: number }>(base, '/api/codes/reset', { body: { id } }),
}
