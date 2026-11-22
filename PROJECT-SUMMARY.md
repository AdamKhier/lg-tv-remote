# LG TV IR Remote over Wi-Fi — Project Summary

> Reconstructed 22 Nov 2026 from the repository itself, not from chat history.

## What it is
An ESP32-S3 next to the TV with an IR LED pointed at it; a React web app talks to it over the home network and fires LG infrared codes. No cloud, no accounts, no app install.

```
phone / laptop ── HTTP (JSON) ──▶ ESP32 ── IR (NEC, 38 kHz) ──▶ LG TV
```

## Stack
- `firmware/lg-tv-remote/lg-tv-remote.ino` — Arduino sketch: Wi-Fi, mDNS (`tvremote.local`), JSON API, LG code table, optional IR-receiver learn mode
- `web/` — React 19 + TypeScript + Tailwind 4 single-page remote
- `tools/mock-device.mjs` — fake bridge for developing without hardware
- `tools/flash.sh` — arduino-cli wrapper that refuses to flash a placeholder Wi-Fi config

## API
`GET /api/status`, `GET /api/codes`, `POST /api/key`, `POST /api/learn/start`, `GET /api/learn/status`, `POST /api/learn/cancel`, `POST /api/codes/reset`. CORS is open and the API is unauthenticated by design — keep it LAN-only.

## How to run
```bash
cd web && npm install && npm run dev
node tools/mock-device.mjs 8099     # or: cd web && npm run mock
bash tools/flash.sh                 # after setting Wi-Fi credentials
```

## Status
The web app, learn mode and the offline path were verified in a browser against the mock bridge. The sketch has **never been compiled**, no IR has been emitted, and mixed-content behaviour on https hosting comes from documentation, not a live test. Expect to adjust LED drive and IR pin once wired.

## Git
`AdamKhier/lg-tv-remote` — public.
