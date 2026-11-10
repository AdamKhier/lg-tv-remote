# LG TV IR Remote over Wi-Fi

An ESP32 sits next to the TV with an IR LED pointed at it. A web app talks to the ESP32 over your
home network and fires LG infrared codes. No cloud, no accounts, no app install.

```
 phone / laptop ── HTTP (JSON) ──▶ ESP32 ── IR (NEC, 38 kHz) ──▶ LG TV
```

Two pieces, both in this repo:

| Path | What it is |
| --- | --- |
| [`firmware/lg-tv-remote/lg-tv-remote.ino`](firmware/lg-tv-remote/lg-tv-remote.ino) | Arduino sketch: Wi-Fi, mDNS, a small JSON API, LG code table, optional IR-receiver learn mode |
| [`web/`](web) | React + TypeScript + Tailwind single-page remote |
| [`tools/mock-device.mjs`](tools/mock-device.mjs) | Fake bridge that speaks the same API, for developing the UI without hardware |

---

## 1. Parts

- ESP32 board. This build is configured for an **ESP32-S3 N16R8**, but the sketch is pin-agnostic.
- IR transmitter: either a 3-pin module (`GND` / `VCC` / `DAT`) or a bare 940 nm LED plus an NPN
  transistor and resistors.
- *Optional:* TSOP38238 IR receiver module, only needed to copy buttons that aren't in the built-in
  table (the app shortcuts, or a Settings key that differs on your model).

### 3-pin transmitter module (GND / VCC / DAT)

| Module pin | ESP32-S3 pin | Why |
| --- | --- | --- |
| `GND` | `GND` | any ground pin |
| `VCC` | `3V3` | start here — safe whether or not the module has a driver transistor |
| `DAT` | `GPIO 4` | matches `IR_SEND_PIN` in the sketch |

Start with `VCC` on **3V3**. Only move it to the **5V** pin (VBUS, present while powered over USB) if
you can see a transistor on the module board; a module that is nothing but an LED and a series
resistor would then push 5 V back into `DAT` and into the GPIO. 5 V buys extra range, 3.3 V is safe
every time.

The module needs no level shifter: the S3's 3.3 V logic is what its `DAT` input expects.

### Bare LED alternative (no module)

An ESP32 GPIO can safely source around 20 mA. Pushing a bare IR LED at the current needed for useful
range will brown out the chip or kill the pin, so switch it with a transistor:

```
                  +5V (5V pin, USB powered)
                       │
                    [ 100 Ω ]
                       │
                     ──┴──  IR LED (anode ▲, cathode ▼)
                       │
  GPIO 4 ──[ 1 kΩ ]──┤ C  2N2222 / BC337 (NPN)
                       │ E
                      GND
```

- `IR_SEND_PIN` is GPIO 4 in the sketch. Change it there if you wired a different pin.
- One LED is enough across a normal room if it points at the TV. For a bigger room, put 2–3 LEDs in
  series with a smaller resistor (3 LEDs at 5 V ≈ 15–22 Ω) rather than wiring them in parallel.

### ESP32-S3 pin limits

Safe: **GPIO 4–18, 21**. Avoid `19`/`20` (native USB), `26–37` (flash and octal PSRAM on N16R8),
`0`/`3`/`45`/`46` (strapping), `43`/`44` (UART0). The sketch's receiver pin is GPIO 5 for exactly
this reason — GPIO 19 on a WROOM board would have been the USB data line on your S3.

### Optional: IR receiver for learn mode

```
TSOP38238:  VCC → 3V3     GND → GND     OUT → GPIO 5
```

Then set `#define IR_RECEIVER_ENABLED 1` in the sketch. A 100 Ω resistor in series with VCC and a
100 µF capacitor across the supply help if the receiver picks up noise.

---

## 2. Flash the ESP32

1. Arduino IDE → **Boards Manager** → install the **esp32** package by Espressif.
2. **Library Manager** → install **IRremoteESP8266**.
3. Open [`firmware/lg-tv-remote/lg-tv-remote.ino`](firmware/lg-tv-remote/lg-tv-remote.ino) and edit
   the config block at the top:

   ```cpp
   static const char* WIFI_SSID = "your-wifi-name";
   static const char* WIFI_PASS = "your-wifi-password";
   #define IR_SEND_PIN 4
   #define IR_RECEIVER_ENABLED 0   // 1 if you wired the TSOP38238
   #define IR_RECV_PIN 5
   static const char* HOSTNAME = "tvremote";
   ```

4. Select the board, select the port, upload. Open the Serial Monitor at **115200** to watch it
   connect — it prints its IP address.

### ESP32-S3 N16R8 board settings (Arduino IDE → Tools)

| Setting | Value |
| --- | --- |
| Board | **ESP32S3 Dev Module** |
| USB CDC On Boot | **Enabled** on the **native USB** socket, **Disabled** on a **COM/UART** socket — see below |
| Flash Size | **16MB (128Mb)** |
| PSRAM | **OPI PSRAM** |
| Flash Mode | QIO 80MHz |
| Partition Scheme | 16M Flash (any is fine — the sketch is small) |
| Upload Speed | 921600, or 460800 if uploads fail |

If the port never appears or the upload cannot connect: hold **BOOT**, tap **RESET**, release **BOOT**,
and upload again.

### The two USB sockets are not interchangeable

Most S3 dev boards have two sockets, and the firmware's serial output only appears on the one it was
built for. Getting this wrong still uploads fine — the Serial Monitor just stays silent.

| Socket | Chip seen by the computer | Serial goes to | Setting |
| --- | --- | --- | --- |
| **USB** (native) | `303a:1001 Espressif USB JTAG/serial` | USB-Serial-JTAG peripheral | `USB CDC On Boot: Enabled` |
| **COM / UART** | `1a86:… QinHeng` (CH343/CH340) | real UART0 pins | `USB CDC On Boot: Disabled` |

Check which one you are plugged into with `lsusb` or `ls /dev/serial/by-id/`.

One more Linux wrinkle: the native USB socket appears as `root:uucp` with mode `0660`, so flashing
fails with `Permission denied` unless your user is in `uucp` (Arch) / `dialout` (Debian, Ubuntu).
Either add yourself to that group, or drop a udev rule:

```bash
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="303a", MODE="0666"' | sudo tee /etc/udev/rules.d/99-esp32-usb.rules
sudo udevadm control --reload-rules && sudo udevadm trigger --action=add --subsystem-match=tty
```

### Flashing from the command line (no Arduino IDE)

`arduino-cli` is already installed in `.tools/` with the ESP32 core and IRremoteESP8266. After you
edit the Wi-Fi name and password at the top of the sketch:

```bash
bash tools/flash.sh                 # auto-detects /dev/ttyACM0 (or /dev/ttyUSB*)
bash tools/flash.sh /dev/ttyACM0    # or name the port yourself
```

The script refuses to run while the sketch still holds `your-wifi-name`, so a placeholder build can
never end up on the board by accident. It compiles for `esp32:esp32:esp32s3` with 16MB flash and OPI
PSRAM, works out **which USB socket** you are on from the port's USB ID, and picks the matching
`USB CDC On Boot` option automatically. Override it with `ESP32_CONSOLE=native` or `ESP32_CONSOLE=uart`
if the guess is ever wrong.

Watch the boot log with:

```bash
.tools/arduino-cli monitor -p /dev/ttyACM0 --config baudrate=115200
```

Opening the monitor resets the board over the native USB socket, so the startup lines (SSID, IP
address) come back on their own. On a UART bridge socket, tap **RST** after connecting instead.

Sanity check: open `http://<esp32-ip>/` in a browser. You should get the little status page listing
the endpoints. The bridge is also reachable at `http://tvremote.local` on most networks.

**If it never joins Wi-Fi** it falls back to a hotspot instead of becoming a brick: join SSID
`tvremote` (password `tvremote1234`) and open `http://192.168.4.1`. The boot log says
`WiFi failed, starting setup hotspot`, and there are only four common causes: a 5 GHz-only network
(the S3 has no 5 GHz radio), a wrong password, WPA3-only security, or an **SSID that differs by so
much as a trailing space**. Check the exact name your access point broadcasts with
`nmcli -t -f SSID,CHAN dev wifi list` — a colon-delimited line like `MyNet :1:…` means the real name
is `MyNet ` with a space.

---

## 3. Run the web app

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

Enter the ESP32's address (`192.168.1.50` or `tvremote.local`) and press Connect. The address is
remembered, so a phone that has connected once goes straight to the remote next time.

To use it from your phone on the same Wi-Fi:

```bash
npm run dev -- --host      # then open the printed http://<your-computer-ip>:5173 on the phone
```

If the phone says the site is unreachable while `curl http://<your-computer-ip>:5173` works on the
computer itself, a host firewall is dropping the connection. On Linux with firewalld:

```bash
sudo firewall-cmd --add-port=5173/tcp            # until next reboot
sudo firewall-cmd --permanent --add-port=5173/tcp && sudo firewall-cmd --reload   # permanent
```

The phone must also be on the **same SSID and subnet** as the computer and the ESP32 — guest
networks and IoT VLANs usually cannot reach each other.

### Developing without the hardware

```bash
node tools/mock-device.mjs 8099     # or: cd web && npm run mock
```

Then connect the app to `localhost:8099`. Every key press is logged with the frame it would have
transmitted, e.g. `IR  20DF10EF  power`. Learn mode fakes a capture after ~2 seconds.
`MOCK_NO_RECEIVER=1 node tools/mock-device.mjs` simulates a board without a receiver, to see that
path in the UI.

---

## 4. Hosting it, and the mixed-content catch

The bridge is plain HTTP on a private address. A page served over **HTTPS** is not allowed to call it
unless the browser agrees, and browsers disagree differently:

| Where the app is served | Chrome / Edge | Safari / iOS |
| --- | --- | --- |
| `https://…` (any static host) | Works after you allow **local-network access** (Chrome 142+) | **Blocked** — mixed content |
| `http://<lan-ip>:5173` or any http server on your LAN | Works | Works |
| `http://localhost:5173` | Works | Works |

What this means in practice:

- **Chrome/Edge + a hosted build** is a valid setup: `npm run build` → upload `web/dist` anywhere
  static, then grant the local-network permission prompt on first use.
- **iPhone or Safari** needs the app served over http on the same network. Either run `npm run dev --
  --host` on a computer that stays on, or serve the built `dist/` from something on the LAN
  (`npx serve web/dist`).
- Firefox has been rolling out its own local-network permission since 147, so behaviour varies by
  version and settings.

The app detects this situation itself: if it's running on https and you enter a private address, it
says so up front instead of failing silently.

### Moving it to a server on your LAN

This is the recommended setup when there is an always-on box on the same network as the TV: no
laptop, no dev server, and plain HTTP so every phone works.

**Copy the `web/` folder** (source, `package.json`, `package-lock.json`) to the server, then:

```bash
cd web && npm ci && npm run build       # produces web/dist, ~290 KB total
```

Building requires **Node 20.19+ or 22.12+** (Vite 7). On Node 18 the failure is misleading —
`Cannot find native binding` from `@tailwindcss/oxide`, because npm drops that package's prebuilt
binary when its engine requirement does not match. The `engines` field in `package.json` names the
requirement. A per-user `nvm install 22` avoids touching the system Node, and must be followed by
`rm -rf node_modules` before `npm ci`, since an existing tree is not repaired.

If you prefer not to install Node there, run the same build on any machine and copy **`web/dist/`**
as-is — it is self-contained static files with no server-side code.

Do **not** copy `node_modules/`, `.tools/` (the Arduino toolchain) or `tools/mock-device.mjs`; none
of them are needed at runtime.

Point any static file server at that directory. nginx:

```nginx
server {
  listen 80;
  server_name tv-remote.lan;       # or just the server's IP
  root /var/www/tv-remote;         # contents of web/dist
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

Caddy, which is shorter if you already run it:

```
tv-remote.lan {
  root * /var/www/tv-remote
  file_server
}
```

Or with nothing installed at all, from inside `dist/`:

```bash
python3 -m http.server 8080
```

Things that need changing, and things that do not:

- **Nothing to configure in the app.** There is no backend, no API key, no database. The ESP32's
  address is typed into the first screen once per browser and kept in `localStorage`.
- **Keep it on plain HTTP.** If the server already terminates TLS, put this app on a separate http
  port rather than behind the https vhost: an https page is exactly what Safari refuses to use when
  calling `http://192.168.x.x`.
- **Subdirectories are fine.** `base: './'` in `vite.config.ts` makes asset paths relative, so
  `http://server/remote/` works as well as `http://server/`.
- **Open the server's port** in its firewall (80, or whatever you chose).
- **Give the ESP32 a fixed address.** The app stores whatever you type; if your router hands the
  board a new lease the saved address goes stale. Either add a DHCP reservation or use
  `http://tvremote.local`, which the firmware advertises over mDNS.

---

## 5. The IR codes

Consumer LG remotes use **NEC at 38 kHz, address `0x20`**, with the 32-bit frame
`20 DF <cmd> <~cmd>`. Power is therefore `20DF10EF`. Those commands ship in the firmware:

| Button | Command | Button | Command |
| --- | --- | --- | --- |
| Power | `0x10` | OK | `0x22` |
| Vol + / − | `0x40` / `0xC0` | Back | `0x14` |
| Mute | `0x90` | Home / Smart | `0xC2` |
| Ch + / − | `0x00` / `0x80` | Exit | `0xDA` |
| Input | `0xD0` | Info | `0x55` |
| Up / Down | `0x02` / `0x82` | Digits 1–9 | `0x88 … 0x18` |
| Left / Right | `0xE0` / `0x60` | Digit 0 | `0x08` |
| Red / Green | `0x4E` / `0x8E` | Yellow / Blue | `0xC6` / `0x86` |

Two honest caveats:

- **`0xC2` is labelled differently depending on model** — Home on some TVs, Settings on others.
  That's why it's called "Home / Smart" in the UI. If yours opens the wrong thing, teach the button
  you actually want.
- **App shortcuts (Netflix, Prime, YouTube, Disney+) ship with no code.** Published tables disagree
  and the bytes are model-dependent, so rather than guess they are learn-only slots. Tap one and the
  app asks you to press the real button on your remote (needs the optional IR receiver).

The service-remote table with address `0x04` is a *different* LG code set — don't mix its bytes into
these frames.

### Learn mode

1. Wire the TSOP38238 and set `IR_RECEIVER_ENABLED 1`, re-flash.
2. In the app: tap an untaught tile, or Settings → the pencil next to any button.
3. Point your LG remote at the receiver and press the button within 15 seconds.

The captured frame is stored in the ESP32's NVS flash, so it survives a re-flash, and it overrides
the built-in code for that button. Settings can clear one mapping or all of them.

---

## 6. API reference

Base URL is the ESP32's address. Every response is JSON with CORS `*`; `OPTIONS` preflights are
handled on every endpoint.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/status` | — | device, firmware, IP, RSSI, uptime, `hasReceiver`, learn state |
| GET | `/api/codes` | — | the full key table with hex codes and `learned`/`builtin` flags |
| POST | `/api/key` | `{"id":"power"}` or `{"code":"20DF10EF"}`, optional `{"repeat":2}` | `{"ok":true,"code":"20DF10EF"}` |
| POST | `/api/learn/start` | `{"id":"app_netflix"}` | arms the receiver for 15 s |
| GET | `/api/learn/status` | — | `active`, `keyId`, `captured`, `code`, `remainingMs`, `error` |
| POST | `/api/learn/cancel` | `{}` | stops listening |
| POST | `/api/codes/reset` | `{"id":"all"}` or `{"id":"app_netflix"}` | `{"ok":true,"cleared":1}` |

Errors look like `{"ok":false,"error":"key_not_learned"}` with a matching status code
(`409` untaught button, `404` unknown key, `501` no receiver, `400` bad payload).

Curling the bridge directly is a good way to isolate "app problem" from "IR/hardware problem":

```bash
curl -X POST http://192.168.1.50/api/key -H 'Content-Type: application/json' \
     -d '{"id":"power"}'
```

---

## 7. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| App says "No answer from…" | Wrong address, ESP32 on another network, or the bridge fell back to its hotspot (`192.168.4.1`) |
| Works in curl, fails in the browser | Mixed content — see §4 |
| Bridge answers, TV ignores it | Point a phone camera at the LED and press Power — a purple/white flicker means the IR is firing and it's an aim/range problem, nothing at all means the wiring or `IR_SEND_PIN` is wrong |
| Volume repeats but power doesn't fire | Power frame is fine; check the LED is aimed while you're testing |
| One button does the wrong thing | Teach that button from your real remote (label quirks like `0xC2`) |
| "That button has no code yet" | App-shortcut buttons need learn mode first |

---

## 8. Security and scope

The API is **unauthenticated** — anyone on your network who can reach the ESP32 can control the TV,
and CORS is open so any page you visit could talk to it while you're on that network. That's a
reasonable trade for a LAN toy, not something to expose to the internet. If you ever port-forward it
or put it behind a tunnel, add a shared token check in `handleKey()` first.

Not built yet: scenes/macros, schedules, a device-served copy of the UI (which would sidestep the
mixed-content problem entirely), and any kind of auth.

---

## 9. What has been verified

Ran against the mock bridge, in a real browser:

- typecheck (`tsc --noEmit`) and production build are clean;
- connecting, the full remote pad, digits, colours and app tiles send the expected frames
  (`power` → `20DF10EF`, `mute` → `20DF906F`, …);
- press-and-hold repeat: a 900 ms hold on Vol+ produced 1 press + 3 repeats;
- learn mode end to end (capture → tile flips to LEARNED → test-send of the captured frame);
- per-button clear and the two-step "erase all learned codes";
- keyboard shortcuts (arrows, Enter, M, +/−);
- the offline path: with the bridge down, connecting fails with an explicit message instead of a
  blank screen.

**Not verified, because this environment has no hardware or Arduino toolchain:** the sketch has not
been compiled, no IR has actually been emitted, and the mixed-content behaviour in §4 comes from
browser documentation rather than a live https deployment. Expect to adjust the LED drive or IR pin
once you have it wired up.
