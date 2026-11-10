#!/usr/bin/env bash
# Compile the LG TV remote sketch and upload it to a connected ESP32-S3.
#
#   bash tools/flash.sh                 # auto-detect the port
#   bash tools/flash.sh /dev/ttyACM0    # or name it explicitly
#
# The S3 dev boards expose two different USB sockets, and they need
# *different* firmware builds:
#
#   "USB"  (native, Espressif USB-JTAG) -> Serial goes to the USB-Serial-JTAG
#                                          peripheral  => CDCOnBoot=cdc
#   "COM"  (CH343/CH340 bridge chip)    -> Serial goes to UART0 / the bridge
#                                          => CDCOnBoot=default
#
# Getting this wrong still uploads fine, but the Serial Monitor then stays
# silent, so the script works it out from the port itself.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="${ROOT}/.tools/arduino-cli"
SKETCH="${ROOT}/firmware/lg-tv-remote"
BASE="esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,PartitionScheme=default"

if [[ ! -x "$CLI" ]]; then
  echo "arduino-cli missing. Install it with:" >&2
  echo "  mkdir -p .tools && cd .tools && \\" >&2
  echo "    curl -sL https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz | tar xz arduino-cli" >&2
  exit 1
fi

if ! "$CLI" core list 2>/dev/null | grep -q '^esp32:esp32'; then
  echo "ESP32 core missing. Run:" >&2
  echo "  .tools/arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json" >&2
  echo "  .tools/arduino-cli core install esp32:esp32" >&2
  echo "  .tools/arduino-cli lib install IRremoteESP8266" >&2
  exit 1
fi

if grep -q 'your-wifi-name' "$SKETCH/lg-tv-remote.ino"; then
  echo "Wi-Fi not configured: edit WIFI_SSID / WIFI_PASS in $SKETCH/lg-tv-remote.ino" >&2
  exit 1
fi

PORT="${1:-}"
if [[ -z "$PORT" ]]; then
  PORT="$(ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PORT" ]]; then
  echo "No board found. Plug the ESP32-S3 in with a data cable (not charge-only)." >&2
  echo "Ports seen:" >&2
  "$CLI" board list >&2 || true
  exit 1
fi

if [[ ! -r "$PORT" || ! -w "$PORT" ]]; then
  echo "No permission for $PORT." >&2
  ls -l "$PORT" >&2
  echo "Add your user to the serial group, then log back in:" >&2
  echo "  sudo usermod -aG uucp $USER        # Arch: uucp; Debian/Ubuntu: dialout" >&2
  exit 1
fi

# Which USB socket is this? Espressif's own USB-JTAG shows up in by-id;
# a CH343/CH340 bridge does not.
NATIVE_USB=0
for link in /dev/serial/by-id/*; do
  [[ -e "$link" ]] || continue
  [[ "$(readlink -f "$link")" == "$(readlink -f "$PORT")" ]] || continue
  case "$(basename "$link")" in
    *Espressif*) NATIVE_USB=1 ;;
  esac
done

if [[ "${ESP32_CONSOLE:-}" == "uart" ]]; then NATIVE_USB=0; fi
if [[ "${ESP32_CONSOLE:-}" == "native" ]]; then NATIVE_USB=1; fi

if [[ "$NATIVE_USB" == "1" ]]; then
  FQBN="${BASE},USBMode=hwcdc,CDCOnBoot=cdc"
  SOCKET="native USB  (Serial -> USB-Serial-JTAG)"
else
  FQBN="${BASE},USBMode=default,CDCOnBoot=default"
  SOCKET="USB-UART bridge  (Serial -> UART0)"
fi

echo "Port:    $PORT"
echo "Socket:  $SOCKET"
echo "Options: ${FQBN#*esp32s3:}"
"$CLI" compile --fqbn "$FQBN" --warnings default "$SKETCH"
"$CLI" upload --fqbn "$FQBN" --port "$PORT" "$SKETCH"

echo
echo "Uploaded. Watch it boot (tap RST if you see nothing):"
echo "  .tools/arduino-cli monitor -p $PORT --config baudrate=115200"
