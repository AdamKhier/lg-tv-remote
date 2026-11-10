/*
 * LG TV IR Remote — ESP32 LAN bridge
 * ---------------------------------------------------------------
 * Exposes a small JSON API over WiFi so a web app can fire LG NEC
 * infrared codes at a TV. No cloud, no accounts.
 *
 *   GET  /api/status        device info + learn-mode state
 *   GET  /api/codes         the key table (with learned overrides)
 *   POST /api/key           {"id":"power"} or {"code":"20DF10EF"}
 *   POST /api/learn/start   {"id":"app_netflix"}   (needs receiver)
 *   GET  /api/learn/status  {"active":true,...}
 *   POST /api/learn/cancel
 *   POST /api/codes/reset   {"id":"all"} | {"id":"app_netflix"}
 *
 * Arduino IDE: install the "esp32" board package and the
 * "IRremoteESP8266" library (Library Manager), select your board,
 * flash. See the project README for wiring.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>

// ===================== CONFIGURE ME =====================
// NOTE: this network's name really does end with a space - matching is exact.
static const char* WIFI_SSID = "K-BaseCamp-30-Secondary ";
static const char* WIFI_PASS = "P@$$w0rd";

// ESP32-S3 pin notes: safe to use 4-18 and 21. Do NOT use 19/20 (native USB),
// 26-37 (flash + octal PSRAM on N16R8), 0/3/45/46 (strapping), 43/44 (UART0).
#define IR_SEND_PIN 4         // 3-pin module DAT, or LED driver transistor base
#define IR_RECEIVER_ENABLED 0 // set to 1 if you wired a TSOP38238
#define IR_RECV_PIN 5         // receiver OUT (not 19 - that is USB D- on the S3)

static const char* HOSTNAME = "tvremote"; // http://tvremote.local
// ========================================================

#define HTTP_PORT 80
#define FW_VERSION "1.0.0"
#define LG_ADDRESS 0x20
#define NO_CODE 0xFFFF
#define LEARN_TIMEOUT_MS 15000
#define MAX_BURST 10

// Consumer LG remotes: NEC, 38kHz, 32-bit frame
// address(0x20) + ~address(0xDF) + command + ~command.
struct KeyDef {
  const char* id;
  const char* label;
  const char* group;
  uint16_t cmd; // NO_CODE = not shipped, learn it from the real remote
};

// Command bytes cross-checked against Tasmota's LG table and the
// widely reproduced 20DF... gist. Labels differ between LG models for
// C2 (Home vs Settings), hence the "Home / Smart" naming.
static const KeyDef KEY_TABLE[] = {
  {"power",       "Power",       "power",   0x10},
  {"vol_up",      "Vol +",       "volume",  0x40},
  {"vol_down",    "Vol −",       "volume",  0xC0},
  {"mute",        "Mute",        "volume",  0x90},
  {"ch_up",       "Ch +",        "channel", 0x00},
  {"ch_down",     "Ch −",        "channel", 0x80},
  {"input",       "Input",       "power",   0xD0},
  {"up",          "Up",          "nav",     0x02},
  {"down",        "Down",        "nav",     0x82},
  {"left",        "Left",        "nav",     0xE0},
  {"right",       "Right",       "nav",     0x60},
  {"ok",          "OK",          "nav",     0x22},
  {"back",        "Back",        "nav",     0x14},
  {"home",        "Home / Smart","nav",     0xC2},
  {"exit",        "Exit",        "nav",     0xDA},
  {"info",        "Info",        "nav",     0x55},
  {"num_0",       "0",           "digits",  0x08},
  {"num_1",       "1",           "digits",  0x88},
  {"num_2",       "2",           "digits",  0x48},
  {"num_3",       "3",           "digits",  0xC8},
  {"num_4",       "4",           "digits",  0x28},
  {"num_5",       "5",           "digits",  0xA8},
  {"num_6",       "6",           "digits",  0x68},
  {"num_7",       "7",           "digits",  0xE8},
  {"num_8",       "8",           "digits",  0x18},
  {"num_9",       "9",           "digits",  0x98},
  {"color_red",   "Red",         "colors",  0x4E},
  {"color_green", "Green",       "colors",  0x8E},
  {"color_yellow","Yellow",      "colors",  0xC6},
  {"color_blue",  "Blue",        "colors",  0x86},
  // App shortcuts use per-model codes we could not verify, so they ship
  // empty and are filled in with the in-app learn flow.
  {"app_netflix", "Netflix",     "apps",    NO_CODE},
  {"app_prime",   "Prime Video", "apps",    NO_CODE},
  {"app_youtube", "YouTube",     "apps",    NO_CODE},
  {"app_disney",  "Disney+",     "apps",    NO_CODE},
  {"settings",    "TV Settings", "apps",    NO_CODE},
};
static const size_t KEY_COUNT = sizeof(KEY_TABLE) / sizeof(KEY_TABLE[0]);

IRsend irsend(IR_SEND_PIN);
WebServer server(HTTP_PORT);
Preferences prefs;

uint32_t learned[KEY_COUNT];   // 0 = nothing learned for this slot
bool     hasLearned[KEY_COUNT];

// learn-mode state
bool     learnActive = false;
bool     learnCaptured = false;
String   learnKeyId = "";
uint32_t learnDeadline = 0;
uint32_t learnCode = 0;
String   learnError = "";

// Only compiled in when IR_RECEIVER_ENABLED is 1 - no cost otherwise.
#if IR_RECEIVER_ENABLED
IRrecv irrecv(IR_RECV_PIN);
decode_results results;
#endif

// ---------------------------------------------------------------- helpers

int findKeyIndex(const String& id) {
  for (size_t i = 0; i < KEY_COUNT; i++) {
    if (id == KEY_TABLE[i].id) return (int)i;
  }
  return -1;
}

uint16_t builtinCmd(size_t i) { return KEY_TABLE[i].cmd; }

bool hasCode(size_t i) {
  return hasLearned[i] || builtinCmd(i) != NO_CODE;
}

uint32_t codeFor(size_t i) {
  if (hasLearned[i]) return learned[i];
  if (builtinCmd(i) == NO_CODE) return 0;
  uint32_t a = LG_ADDRESS, c = builtinCmd(i);
  return ((a & 0xFF) << 24) | ((~a & 0xFF) << 16) | ((c & 0xFF) << 8) | (~c & 0xFF);
}

String hexCode(uint32_t code) {
  char buf[11];
  snprintf(buf, sizeof(buf), "%08X", code);
  return String(buf);
}

// Learned codes live in NVS as "id:HEXCODE,id:HEXCODE".
void loadLearned() {
  for (size_t i = 0; i < KEY_COUNT; i++) { learned[i] = 0; hasLearned[i] = false; }
  prefs.begin("tvremote", false);
  String blob = prefs.getString("learned", "");
  prefs.end();
  int pos = 0;
  while (pos < (int)blob.length()) {
    int comma = blob.indexOf(',', pos);
    String entry = comma < 0 ? blob.substring(pos) : blob.substring(pos, comma);
    int colon = entry.indexOf(':');
    if (colon > 0) {
      String id = entry.substring(0, colon);
      int idx = findKeyIndex(id);
      if (idx >= 0) {
        learned[idx] = strtoul(entry.substring(colon + 1).c_str(), nullptr, 16);
        hasLearned[idx] = learned[idx] != 0;
      }
    }
    if (comma < 0) break;
    pos = comma + 1;
  }
}

void saveLearned() {
  String blob = "";
  for (size_t i = 0; i < KEY_COUNT; i++) {
    if (!hasLearned[i]) continue;
    if (blob.length()) blob += ",";
    blob += String(KEY_TABLE[i].id) + ":" + hexCode(learned[i]);
  }
  prefs.begin("tvremote", false);
  prefs.putString("learned", blob);
  prefs.end();
}

// Tiny helpers so the sketch needs no JSON library. Our own client only
// ever sends flat objects of strings and numbers.
String jsonStringField(const String& body, const char* key) {
  String needle = String("\"") + key + "\"";
  int k = body.indexOf(needle);
  if (k < 0) return "";
  int colon = body.indexOf(':', k + needle.length());
  if (colon < 0) return "";
  int q1 = body.indexOf('"', colon + 1);
  if (q1 < 0) return "";
  int q2 = body.indexOf('"', q1 + 1);
  if (q2 < 0) return "";
  return body.substring(q1 + 1, q2);
}

long jsonIntField(const String& body, const char* key, long fallback) {
  String needle = String("\"") + key + "\"";
  int k = body.indexOf(needle);
  if (k < 0) return fallback;
  int colon = body.indexOf(':', k + needle.length());
  if (colon < 0) return fallback;
  return body.substring(colon + 1).toInt();
}

void cors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Access-Control-Max-Age", "86400");
  // Legacy Private Network Access opt-in; harmless where unsupported.
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
  server.sendHeader("Cache-Control", "no-store");
}

void sendJson(int status, const String& body) {
  cors();
  server.send(status, "application/json", body);
}

void sendError(int status, const char* code) {
  sendJson(status, String("{\"ok\":false,\"error\":\"") + code + "\"}");
}

String learnJson() {
  String s = "{\"active\":";
  s += learnActive ? "true" : "false";
  s += ",\"keyId\":\"" + learnKeyId + "\"";
  s += ",\"captured\":";
  s += learnCaptured ? "true" : "false";
  s += ",\"code\":";
  s += learnCaptured ? "\"" + hexCode(learnCode) + "\"" : "null";
  s += ",\"remainingMs\":";
  s += learnActive ? String((long)(learnDeadline > millis() ? learnDeadline - millis() : 0)) : "0";
  s += ",\"error\":";
  s += learnError.length() ? "\"" + learnError + "\"" : "null";
  s += "}";
  return s;
}

bool fireCode(uint32_t code, int repeats) {
  if (repeats < 0) repeats = 0;
  if (repeats > MAX_BURST) repeats = MAX_BURST;
  irsend.sendNEC(code, 32, repeats);
  return true;
}

// ---------------------------------------------------------------- handlers

void handleStatus() {
  String ip = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  String s = "{\"ok\":true,\"device\":\"lg-tv-ir-remote\",\"fw\":\"" FW_VERSION "\"";
  s += ",\"ip\":\"" + ip + "\"";
  s += ",\"mdns\":\"" + String(HOSTNAME) + ".local\"";
  s += ",\"protocol\":\"NEC\",\"bits\":32,\"address\":\"0x20\"";
  s += ",\"hasReceiver\":";
  s += IR_RECEIVER_ENABLED ? "true" : "false";
  s += ",\"rssi\":";
  s += WiFi.status() == WL_CONNECTED ? String(WiFi.RSSI()) : "null";
  s += ",\"uptimeMs\":";
  s += String((unsigned long)millis());
  s += ",\"learn\":" + learnJson();
  s += "}";
  sendJson(200, s);
}

void handleCodes() {
  String s = "{\"ok\":true,\"profile\":\"lg-nec-0x20\",\"protocol\":\"NEC\",\"bits\":32";
  s += ",\"address\":\"0x20\",\"keys\":[";
  for (size_t i = 0; i < KEY_COUNT; i++) {
    if (i) s += ",";
    bool ready = hasCode(i);
    s += "{\"id\":\"" + String(KEY_TABLE[i].id) + "\"";
    s += ",\"label\":\"" + String(KEY_TABLE[i].label) + "\"";
    s += ",\"group\":\"" + String(KEY_TABLE[i].group) + "\"";
    s += ",\"code\":";
    s += ready ? "\"" + hexCode(codeFor(i)) + "\"" : "null";
    s += ",\"learned\":";
    s += hasLearned[i] ? "true" : "false";
    s += ",\"builtin\":";
    s += builtinCmd(i) != NO_CODE ? "true" : "false";
    s += "}";
  }
  s += "]}";
  sendJson(200, s);
}

void handleKey() {
  String body = server.hasArg("plain") ? server.arg("plain") : "";
  int repeats = (int)jsonIntField(body, "repeat", 0);

  String id = jsonStringField(body, "id");
  String raw = jsonStringField(body, "code");

  uint32_t code = 0;
  if (raw.length()) {
    code = strtoul(raw.c_str(), nullptr, 16); // accepts "20DF10EF" or "0x20DF10EF"
    if (!code) return sendError(400, "bad_code");
  } else if (id.length()) {
    int idx = findKeyIndex(id);
    if (idx < 0) return sendError(404, "unknown_key");
    if (!hasCode(idx)) return sendError(409, "key_not_learned");
    code = codeFor(idx);
  } else {
    return sendError(400, "missing_id");
  }

  fireCode(code, repeats);
  String s = "{\"ok\":true,\"id\":\"" + id + "\",\"code\":\"" + hexCode(code) + "\"";
  s += ",\"repeats\":" + String(repeats) + "}";
  sendJson(200, s);
}

void handleLearnStart() {
  if (!IR_RECEIVER_ENABLED) return sendError(501, "no_receiver");
  String body = server.hasArg("plain") ? server.arg("plain") : "";
  String id = jsonStringField(body, "id");
  int idx = findKeyIndex(id);
  if (idx < 0) return sendError(404, "unknown_key");

  learnKeyId = id;
  learnActive = true;
  learnCaptured = false;
  learnError = "";
  learnDeadline = millis() + LEARN_TIMEOUT_MS;
#if IR_RECEIVER_ENABLED
  irrecv.resume(); // make sure the receiver is listening
#endif
  String s = "{\"ok\":true,\"keyId\":\"" + id + "\",\"timeoutMs\":" + String(LEARN_TIMEOUT_MS) + "}";
  sendJson(200, s);
}

void handleLearnStatus() { sendJson(200, String("{\"ok\":true,") + learnJson().substring(1)); }

void handleLearnCancel() {
  learnActive = false;
  learnError = "cancelled";
  sendJson(200, String("{\"ok\":true,") + learnJson().substring(1));
}

void handleReset() {
  String body = server.hasArg("plain") ? server.arg("plain") : "";
  String id = jsonStringField(body, "id");
  int cleared = 0;
  if (id == "all" || id.length() == 0) {
    for (size_t i = 0; i < KEY_COUNT; i++) {
      if (hasLearned[i]) cleared++;
      learned[i] = 0; hasLearned[i] = false;
    }
  } else {
    int idx = findKeyIndex(id);
    if (idx < 0) return sendError(404, "unknown_key");
    if (hasLearned[idx]) cleared = 1;
    learned[idx] = 0; hasLearned[idx] = false;
  }
  saveLearned();
  sendJson(200, "{\"ok\":true,\"cleared\":" + String(cleared) + "}");
}

void handleOptions() {
  cors();
  server.send(204, "text/plain", "");
}

void handleRoot() {
  String ip = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>";
  html += "<title>LG TV IR Remote</title>";
  html += "<body style='font:15px system-ui;background:#12141a;color:#e8eaf0;padding:24px;max-width:640px;margin:auto'>";
  html += "<h1 style='font-size:20px'>LG TV IR bridge</h1>";
  html += "<p style='color:#8b93a7'>Firmware " FW_VERSION " &middot; " + ip + "</p>";
  html += "<p>This device is a JSON API for a web remote. Endpoints:</p><ul style='line-height:1.7'>";
  html += "<li><code>GET /api/status</code></li><li><code>GET /api/codes</code></li>";
  html += "<li><code>POST /api/key</code> {&quot;id&quot;:&quot;power&quot;}</li>";
  html += "<li><code>POST /api/learn/start</code> {&quot;id&quot;:&quot;app_netflix&quot;}</li>";
  html += "</ul></body>";
  cors();
  server.send(200, "text/html", html);
}

void handleNotFound() { sendError(404, "not_found"); }

// ---------------------------------------------------------------- setup/loop

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // keep IR timing jitter-free
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to %s", WIFI_SSID);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(400);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK, http://");
    Serial.println(WiFi.localIP());
  } else {
    // Still usable: join the hotspot and point the app at 192.168.4.1
    Serial.println("WiFi failed, starting setup hotspot");
    WiFi.mode(WIFI_AP);
    WiFi.softAP(HOSTNAME, "tvremote1234");
    Serial.print("Hotspot '"); Serial.print(HOSTNAME);
    Serial.print("' -> http://"); Serial.println(WiFi.softAPIP());
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nLG TV IR remote starting");

  pinMode(IR_SEND_PIN, OUTPUT);
  digitalWrite(IR_SEND_PIN, LOW);
  irsend.begin();

#if IR_RECEIVER_ENABLED
  irrecv.enableIRIn();
#endif

  loadLearned();

  connectWiFi();

  if (MDNS.begin(HOSTNAME)) {
    MDNS.addService("http", "tcp", HTTP_PORT);
    Serial.printf("mDNS: http://%s.local\n", HOSTNAME);
  }

  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/codes", HTTP_GET, handleCodes);
  server.on("/api/key", HTTP_POST, handleKey);
  server.on("/api/learn/start", HTTP_POST, handleLearnStart);
  server.on("/api/learn/status", HTTP_GET, handleLearnStatus);
  server.on("/api/learn/cancel", HTTP_POST, handleLearnCancel);
  server.on("/api/codes/reset", HTTP_POST, handleReset);

  // CORS preflight for every endpoint
  const char* paths[] = {"/api/status", "/api/codes", "/api/key", "/api/learn/start",
                         "/api/learn/status", "/api/learn/cancel", "/api/codes/reset"};
  for (auto p : paths) server.on(p, HTTP_OPTIONS, handleOptions);

  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("HTTP server up");
}

void loop() {
  server.handleClient();

  if (learnActive && (int32_t)(millis() - learnDeadline) >= 0) {
    learnActive = false;
    learnError = "timeout";
  }

#if IR_RECEIVER_ENABLED
  if (irrecv.decode(&results)) {
    if (learnActive && results.bits >= 32 && results.decode_type != UNKNOWN) {
      uint32_t code = (uint32_t)results.value;
      // 0xFFFFFFFF is the NEC repeat frame, not a button press.
      if (code != 0xFFFFFFFF) {
        int idx = findKeyIndex(learnKeyId);
        if (idx >= 0) {
          learned[idx] = code;
          hasLearned[idx] = true;
          saveLearned();
          learnCode = code;
          learnCaptured = true;
          learnActive = false;
          learnError = "";
          Serial.printf("Learned %s = %08X\n", learnKeyId.c_str(), code);
        }
      }
    }
    irrecv.resume();
  }
#endif

  delay(2);
}
