#!/usr/bin/env node
// Mock of the ESP32 IR bridge, for developing the web app without hardware.
// Speaks the same JSON API and CORS headers as the firmware.
//
//   node tools/mock-device.mjs [port]        default 8099
//
// POST /api/key prints the frame it would have transmitted.

import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 8099)
const HAS_RECEIVER = process.env.MOCK_NO_RECEIVER !== '1'

const BUILTIN = {
  power: 0x20df10ef,
  vol_up: 0x20df40bf,
  vol_down: 0x20dfc03f,
  mute: 0x20df906f,
  ch_up: 0x20df00ff,
  ch_down: 0x20df807f,
  input: 0x20dfd02f,
  up: 0x20df02fd,
  down: 0x20df827d,
  left: 0x20dfe01f,
  right: 0x20df609f,
  ok: 0x20df22dd,
  back: 0x20df14eb,
  home: 0x20dfc23d,
  exit: 0x20dfda25,
  info: 0x20df55aa,
  num_0: 0x20df08f7,
  num_1: 0x20df8877,
  num_2: 0x20df48b7,
  num_3: 0x20dfc837,
  num_4: 0x20df28d7,
  num_5: 0x20dfa857,
  num_6: 0x20df6897,
  num_7: 0x20dfe817,
  num_8: 0x20df18e7,
  num_9: 0x20df9867,
  color_red: 0x20df4eb1,
  color_green: 0x20df8e71,
  color_yellow: 0x20dfc639,
  color_blue: 0x20df8679,
}

const LABELS = {
  power: ['Power', 'power'],
  vol_up: ['Vol +', 'volume'],
  vol_down: ['Vol −', 'volume'],
  mute: ['Mute', 'volume'],
  ch_up: ['Ch +', 'channel'],
  ch_down: ['Ch −', 'channel'],
  input: ['Input', 'power'],
  up: ['Up', 'nav'],
  down: ['Down', 'nav'],
  left: ['Left', 'nav'],
  right: ['Right', 'nav'],
  ok: ['OK', 'nav'],
  back: ['Back', 'nav'],
  home: ['Home / Smart', 'nav'],
  exit: ['Exit', 'nav'],
  info: ['Info', 'nav'],
  app_netflix: ['Netflix', 'apps'],
  app_prime: ['Prime Video', 'apps'],
  app_youtube: ['YouTube', 'apps'],
  app_disney: ['Disney+', 'apps'],
  settings: ['TV Settings', 'apps'],
}

for (let digit = 0; digit <= 9; digit += 1) LABELS[`num_${digit}`] = [`${digit}`, 'digits']
for (const [id, label] of Object.entries({
  color_red: 'Red',
  color_green: 'Green',
  color_yellow: 'Yellow',
  color_blue: 'Blue',
})) {
  LABELS[id] = [label, 'colors']
}

const KEYS = Object.keys(LABELS)

const learned = new Map()
let learn = { active: false, keyId: '', captured: false, code: null, remainingMs: 0, error: null }
let learnTimer = null

const started = Date.now()

const hex = (value) => value.toString(16).padStart(8, '0').toUpperCase()

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Cache-Control', 'no-store')
}

function json(res, status, payload) {
  cors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function codeFor(id) {
  if (learned.has(id)) return learned.get(id)
  return BUILTIN[id] ?? null
}

function keysPayload() {
  return KEYS.map((id) => {
    const [label, group] = LABELS[id]
    const code = codeFor(id)
    return {
      id,
      label,
      group,
      code: code == null ? null : hex(code),
      learned: learned.has(id),
      builtin: id in BUILTIN,
    }
  })
}

function learnPayload() {
  return {
    active: learn.active,
    keyId: learn.keyId,
    captured: learn.captured,
    code: learn.code,
    remainingMs: learn.remainingMs,
    error: learn.error,
  }
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname

  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(204)
    res.end()
    return
  }

  if (path === '/api/status' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      device: 'lg-tv-ir-remote',
      fw: '1.0.0-mock',
      ip: `127.0.0.1:${PORT}`,
      mdns: 'tvremote.local',
      protocol: 'NEC',
      bits: 32,
      address: '0x20',
      hasReceiver: HAS_RECEIVER,
      rssi: -58,
      uptimeMs: Date.now() - started,
      learn: learnPayload(),
    })
    return
  }

  if (path === '/api/codes' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      profile: 'lg-nec-0x20',
      protocol: 'NEC',
      bits: 32,
      address: '0x20',
      keys: keysPayload(),
    })
    return
  }

  if (path === '/api/key' && req.method === 'POST') {
    const body = await readBody(req)
    const repeat = Math.max(0, Math.min(10, Number(body.repeat) || 0))
    let code = null
    let id = body.id ?? ''

    if (body.code) {
      code = Number.parseInt(String(body.code), 16)
      if (!Number.isFinite(code)) return json(res, 400, { ok: false, error: 'bad_code' })
    } else if (id) {
      if (!(id in LABELS)) return json(res, 404, { ok: false, error: 'unknown_key' })
      code = codeFor(id)
      if (code == null) return json(res, 409, { ok: false, error: 'key_not_learned' })
    } else {
      return json(res, 400, { ok: false, error: 'missing_id' })
    }

    console.log(`IR  ${hex(code)}  ${id || '(raw)'}${repeat ? ` x${repeat + 1}` : ''}`)
    json(res, 200, { ok: true, id, code: hex(code), repeats: repeat })
    return
  }

  if (path === '/api/learn/start' && req.method === 'POST') {
    const body = await readBody(req)
    if (!HAS_RECEIVER) return json(res, 501, { ok: false, error: 'no_receiver' })
    if (!(body.id in LABELS)) return json(res, 404, { ok: false, error: 'unknown_key' })

    clearTimeout(learnTimer)
    learn = { active: true, keyId: body.id, captured: false, code: null, remainingMs: 15000, error: null }
    // Pretend a remote press arrives shortly after.
    learnTimer = setTimeout(() => {
      const fake = 0x20df0000 + Math.floor(Math.random() * 0xff00)
      learned.set(body.id, fake)
      learn = { active: false, keyId: body.id, captured: true, code: hex(fake), remainingMs: 0, error: null }
      console.log(`LEARN ${body.id} = ${hex(fake)}`)
    }, 2200)
    json(res, 200, { ok: true, keyId: body.id, timeoutMs: 15000 })
    return
  }

  if (path === '/api/learn/status' && req.method === 'GET') {
    json(res, 200, { ok: true, ...learnPayload() })
    return
  }

  if (path === '/api/learn/cancel' && req.method === 'POST') {
    clearTimeout(learnTimer)
    learn = { ...learn, active: false, error: 'cancelled' }
    json(res, 200, { ok: true, ...learnPayload() })
    return
  }

  if (path === '/api/codes/reset' && req.method === 'POST') {
    const body = await readBody(req)
    let cleared = 0
    if (!body.id || body.id === 'all') {
      cleared = learned.size
      learned.clear()
    } else {
      if (learned.delete(body.id)) cleared = 1
    }
    json(res, 200, { ok: true, cleared })
    return
  }

  json(res, 404, { ok: false, error: 'not_found' })
})

server.listen(PORT, () => {
  console.log(`mock bridge on http://localhost:${PORT}  (receiver: ${HAS_RECEIVER ? 'yes' : 'no'})`)
})
