#include <Arduino.h>
#include <Bluepad32.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <DNSServer.h>

#include "game_core.h"
#include "ddp_frame.h"
#include "game_lease_guard.h"
#include "session_lifecycle.h"
#include "remote_input.h"
#include "game_controller_page.h"

using namespace hbnf_game;

namespace {

constexpr const char* kDefaultSsid = "HBNF-Cart";
constexpr const char* kMatrixIp = "192.168.8.20";
constexpr uint16_t kLocalUdpPort = 4050;
constexpr uint32_t kFrameMs = 33;
constexpr uint32_t kProbeMs = 250;
constexpr uint32_t kWifiRetryMs = 5000;
constexpr const char* kPlaySsid = "HBNF-Play";

Preferences prefs;
WiFiUDP udp;
ControllerPtr pads[2] = {nullptr, nullptr};
GameManager games;
LeaseGuard guard;
SessionLifecycle lifecycle;
RemoteInputBroker remoteInput;
WebServer gameWeb(80);
WebSocketsServer gameWs(81);
DNSServer captiveDns;
uint8_t ddpSequence = 0;
uint32_t lastFrameAt = 0;
uint32_t lastProbeAt = 0;
uint32_t lastWifiRetryAt = 0;
uint64_t sampleRevision = 0;
bool sessionActive = false;
bool matrixIdentityVerified = false;
bool guestPlayEnabled = false;
String playPassword;

bool macEmpty(const uint8_t mac[6]) {
  for (int i = 0; i < 6; ++i) if (mac[i] != 0) return false;
  return true;
}

bool macEqual(const uint8_t a[6], const uint8_t b[6]) {
  for (int i = 0; i < 6; ++i) if (a[i] != b[i]) return false;
  return true;
}

void readMac(const char* key, uint8_t out[6]) {
  memset(out, 0, 6);
  if (prefs.getBytesLength(key) == 6) prefs.getBytes(key, out, 6);
}

void writeMac(const char* key, const uint8_t mac[6]) {
  prefs.putBytes(key, mac, 6);
}

String macString(const uint8_t mac[6]) {
  char b[18];
  snprintf(b, sizeof(b), "%02x:%02x:%02x:%02x:%02x:%02x",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(b);
}

void onConnectedController(ControllerPtr ctl) {
  if (!ctl || !ctl->isGamepad()) return;
  ControllerProperties props = ctl->getProperties();
  uint8_t p1[6], p2[6];
  readMac("p1mac", p1);
  readMac("p2mac", p2);

  int slot = -1;
  if (!macEmpty(p1) && macEqual(p1, props.btaddr)) slot = 0;
  else if (!macEmpty(p2) && macEqual(p2, props.btaddr)) slot = 1;
  else if (macEmpty(p1)) {
    slot = 0;
    writeMac("p1mac", props.btaddr);
  } else if (macEmpty(p2)) {
    slot = 1;
    writeMac("p2mac", props.btaddr);
  }

  if (slot >= 0 && pads[slot] == nullptr) {
    pads[slot] = ctl;
    Serial.printf("HBNF_PAD_CONNECTED=P%d MAC=%s\n", slot + 1, macString(props.btaddr).c_str());
  } else {
    Serial.printf("HBNF_PAD_IGNORED MAC=%s\n", macString(props.btaddr).c_str());
  }
}

void onDisconnectedController(ControllerPtr ctl) {
  for (int i = 0; i < 2; ++i) {
    if (pads[i] == ctl) {
      pads[i] = nullptr;
      Serial.printf("HBNF_PAD_DISCONNECTED=P%d\n", i + 1);
    }
  }
}

PadState mapPad(ControllerPtr ctl) {
  PadState p;
  if (!ctl || !ctl->isConnected() || !ctl->isGamepad()) return p;
  p.connected = true;
  const uint8_t d = ctl->dpad();
  const uint16_t buttons = ctl->buttons();
  const uint8_t misc = ctl->miscButtons();
  p.up = (d & DPAD_UP) != 0;
  p.down = (d & DPAD_DOWN) != 0;
  p.left = (d & DPAD_LEFT) != 0;
  p.right = (d & DPAD_RIGHT) != 0;
  p.a = (buttons & BUTTON_A) != 0;
  p.b = (buttons & BUTTON_B) != 0;
  p.start = (misc & MISC_BUTTON_START) != 0;
  p.select = (misc & MISC_BUTTON_SELECT) != 0;
  p.lx = (int16_t)ctl->axisX();
  p.ly = (int16_t)ctl->axisY();
  return p;
}

bool parseJsonBool(const String& body, const char* key, bool& out) {
  const String needle = String("\"") + key + "\":";
  int pos = body.indexOf(needle);
  if (pos < 0) return false;
  pos += needle.length();
  while (pos < (int)body.length() && body[pos] == ' ') ++pos;
  if (body.startsWith("true", pos)) { out = true; return true; }
  if (body.startsWith("false", pos)) { out = false; return true; }
  return false;
}

bool parseJsonIntAfter(const String& body, const String& anchor, const char* key, int& out) {
  int begin = body.indexOf(anchor);
  if (begin < 0) return false;
  const String needle = String("\"") + key + "\":";
  int pos = body.indexOf(needle, begin + anchor.length());
  if (pos < 0) return false;
  pos += needle.length();
  while (pos < (int)body.length() && body[pos] == ' ') ++pos;
  int end = pos;
  if (end < (int)body.length() && body[end] == '-') ++end;
  while (end < (int)body.length() && isDigit(body[end])) ++end;
  if (end == pos) return false;
  out = body.substring(pos, end).toInt();
  return true;
}

bool httpGet(const String& path, String& body, uint16_t timeoutMs = 450) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setConnectTimeout(timeoutMs);
  http.setTimeout(timeoutMs);
  const String url = String("http://") + kMatrixIp + path;
  if (!http.begin(url)) return false;
  const int code = http.GET();
  if (code == 200) body = http.getString();
  http.end();
  return code == 200;
}

bool verifyMatrixIdentity() {
  String body;
  if (!httpGet("/json/info", body, 700)) return false;
  int count = -1;
  if (!parseJsonIntAfter(body, "\"leds\":", "count", count)) return false;
  matrixIdentityVerified = (count == 512);
  Serial.printf("HBNF_MATRIX_IDENTITY=%s LEDS=%d IP=%s\n",
                matrixIdentityVerified ? "PASS" : "FAIL", count, kMatrixIp);
  return matrixIdentityVerified;
}

bool sampleMatrix(uint32_t nowMs) {
  String body;
  if (!httpGet("/json/state", body)) return false;
  bool on = false;
  int bri = -1;
  if (!parseJsonBool(body, "on", on)) return false;
  if (!parseJsonIntAfter(body, "", "bri", bri)) return false;

  CanonicalSample sample;
  sample.reachable = true;
  sample.powerOn = on && bri > 0;
  sample.matrixOnline = true;
  sample.brightness = (uint8_t)constrain(bri, 0, 255);
  sample.revision = ++sampleRevision;
  sample.observedRevision = sample.revision;
  guard.ingestCanonical(sample, nowMs);
  return true;
}

bool startSession(uint32_t nowMs);
void endSession(const char* reason);

void sendFrame(const Framebuffer& fb) {
  if (WiFi.status() != WL_CONNECTED) return;
  IPAddress target;
  if (!target.fromString(kMatrixIp)) return;
  auto packets = encodeDdp(fb, ddpSequence);
  for (const auto& packet : packets) {
    udp.beginPacket(target, kDdpPort);
    udp.write(packet.bytes.data(), packet.bytes.size());
    udp.endPacket();
  }
}


bool isHostClient(uint8_t num) {
  IPAddress ip = gameWs.remoteIP(num);
  return ip[0] == 192 && ip[1] == 168 && ip[2] == 8;
}

void broadcastGameState() {
  String msg = String("STATE,") + (guestPlayEnabled ? "1" : "0") + "," + (sessionActive ? "1" : "0");
  gameWs.broadcastTXT(msg);
}

void releaseRemoteClient(uint8_t num, const char* reason = "RELEASED") {
  for (uint8_t s=0;s<2;++s) {
    if (remoteInput.owner(s, millis()) == int(num)) {
      remoteInput.preempt(s);
      gameWs.sendTXT(num, String(reason) + "," + String(s+1));
    }
  }
}

void onGameWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_DISCONNECTED) {
    remoteInput.releaseClient(num);
    return;
  }
  if (type == WStype_CONNECTED) {
    const bool host = isHostClient(num);
    gameWs.sendTXT(num, String("HELLO,") + (host ? "HOST" : "GUEST") + "," +
                       (guestPlayEnabled ? "1" : "0") + "," + (sessionActive ? "1" : "0"));
    return;
  }
  if (type != WStype_TEXT) return;
  String msg((char*)payload, length);
  const bool host = isHostClient(num);

  if (msg.startsWith("PING,")) {
    gameWs.sendTXT(num, String("PONG,") + msg.substring(5));
    return;
  }
  if (msg == "RELEASE") {
    releaseRemoteClient(num);
    return;
  }
  if (msg.startsWith("CLAIM,")) {
    if (!host && !guestPlayEnabled) { gameWs.sendTXT(num, "ERR,GUEST_PLAY_CLOSED"); return; }
    const int requested = msg.substring(6).toInt();
    if (requested < 1 || requested > 2) { gameWs.sendTXT(num, "ERR,INVALID_PLAYER"); return; }
    const uint8_t slot = uint8_t(requested - 1);
    const bool physical = pads[slot] && pads[slot]->isConnected();
    const auto result = remoteInput.claim(num, slot, host, millis(), physical);
    if (result == RemoteInputBroker::Claim::Ok) gameWs.sendTXT(num, String("CLAIMED,") + requested);
    else gameWs.sendTXT(num, physical ? "ERR,DEDICATED_CONTROLLER_HAS_PRIORITY" : "ERR,PLAYER_SLOT_BUSY");
    return;
  }
  if (msg.startsWith("I,")) {
    int p1 = msg.indexOf(',',2);
    if (p1 < 0) return;
    const int requested = msg.substring(2,p1).toInt();
    uint16_t mask = uint16_t(msg.substring(p1+1).toInt());
    if (requested < 1 || requested > 2) return;
    if (!host && !guestPlayEnabled) { remoteInput.releaseClient(num); return; }
    if (!host) mask &= 63u; // guests never receive session/menu authority
    remoteInput.update(num, uint8_t(requested-1), mask, millis());
    return;
  }
  if (host && msg.startsWith("GUEST,")) {
    guestPlayEnabled = msg.endsWith("1");
    if (!guestPlayEnabled) {
      for (uint8_t s=0;s<2;++s) {
        const int owner = remoteInput.owner(s,millis());
        if (owner >= 0 && !remoteInput.privileged(s,millis())) {
          gameWs.sendTXT(uint8_t(owner), String("RELEASED,") + String(s+1));
          remoteInput.preempt(s);
        }
      }
    }
    broadcastGameState();
    return;
  }
  if (host && msg == "SESSION,START") {
    if (!sessionActive) {
      const uint32_t now = millis();
      if (startSession(now)) lifecycle.forceStart(); // keep host-web and gamepad session lifecycle identical
      else gameWs.sendTXT(num, "ERR,SESSION_START_BLOCKED");
      broadcastGameState();
    }
    return;
  }
  if (host && msg == "SESSION,END") {
    if (sessionActive) endSession("HOST_WEB");
    return;
  }
}

String ensurePlayPassword() {
  String value = prefs.getString("play_pass", "");
  if (value.length() >= 8) return value;
  const uint32_t r = esp_random();
  char buf[13];
  snprintf(buf, sizeof(buf), "NF%08lx", (unsigned long)r);
  value = String(buf);
  prefs.putString("play_pass", value);
  return value;
}

void startGameWeb() {
  playPassword = ensurePlayPassword();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(kPlaySsid, playPassword.c_str(), 1, false, 6);
  const IPAddress ap = WiFi.softAPIP();
  captiveDns.start(53, "*", ap);

  auto serveController = []() { gameWeb.send_P(200, "text/html", HBNF_GAME_CONTROLLER_PAGE); };
  gameWeb.on("/", HTTP_GET, serveController);
  gameWeb.on("/hotspot-detect.html", HTTP_GET, serveController);
  gameWeb.on("/generate_204", HTTP_GET, serveController);
  gameWeb.on("/gen_204", HTTP_GET, serveController);
  gameWeb.on("/connecttest.txt", HTTP_GET, serveController);
  gameWeb.onNotFound(serveController);
  gameWeb.begin();

  gameWs.begin();
  gameWs.onEvent(onGameWsEvent);
  Serial.printf("HBNF_PLAY_AP=ONLINE SSID=%s IP=%s\n", kPlaySsid, ap.toString().c_str());
}

void endSession(const char* reason) {
  sessionActive = false;
  lifecycle.forceEnd();
  guard.userExit();
  BP32.enableNewBluetoothConnections(true);
  guestPlayEnabled = false;
  remoteInput.clearAll();
  broadcastGameState();
  Serial.printf("HBNF_GAME_SESSION_END=%s\n", reason);
}

bool startSession(uint32_t nowMs) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("HBNF_GAME_START_BLOCKED=WIFI_OFFLINE");
    return false;
  }
  if (!matrixIdentityVerified && !verifyMatrixIdentity()) {
    Serial.println("HBNF_GAME_START_BLOCKED=MATRIX_IDENTITY");
    return false;
  }
  guard.requestStart(nowMs);
  if ((pads[0] && pads[0]->isConnected()) || remoteInput.pad(0, nowMs).connected) guard.controllerHeartbeat(nowMs);
  if (!sampleMatrix(nowMs) || !guard.mayStream()) {
    Serial.println("HBNF_GAME_START_BLOCKED=MATRIX_STATE");
    guard.userExit();
    return false;
  }
  games.reset();
  BP32.enableNewBluetoothConnections(false);
  sessionActive = true;
  lastFrameAt = nowMs;
  lastProbeAt = nowMs;
  Serial.println("HBNF_GAME_SESSION_START=PASS");
  return true;
}

void connectWifi() {
  const String ssid = prefs.getString("wifi_ssid", kDefaultSsid);
  const String pass = prefs.getString("wifi_pass", "");
  if (pass.length() == 0) {
    Serial.println("HBNF_WIFI=NEEDS_PROVISIONING");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.printf("HBNF_WIFI_CONNECTING SSID=%s\n", ssid.c_str());
}

void printStatus() {
  uint8_t p1[6], p2[6];
  readMac("p1mac", p1);
  readMac("p2mac", p2);
  Serial.printf("HBNF_STATUS WIFI=%s IP=%s MATRIX=%s SESSION=%s P1=%s P2=%s PLAYSSID=%s PLAYPASS=%s\n",
                WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE",
                WiFi.localIP().toString().c_str(),
                matrixIdentityVerified ? "VERIFIED" : "UNVERIFIED",
                sessionActive ? "ACTIVE" : "IDLE",
                macEmpty(p1) ? "UNSET" : macString(p1).c_str(),
                macEmpty(p2) ? "UNSET" : macString(p2).c_str(),
                kPlaySsid, playPassword.c_str());
}

void processSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "STATUS") {
    printStatus();
  } else if (line.startsWith("WIFI_SSID ")) {
    String value = line.substring(10);
    value.trim();
    if (value.length()) {
      prefs.putString("wifi_ssid", value);
      Serial.println("HBNF_WIFI_SSID_STORED=PASS");
    }
  } else if (line.startsWith("WIFI_PASS ")) {
    const String value = line.substring(10);
    if (value.length()) {
      prefs.putString("wifi_pass", value);
      Serial.printf("HBNF_WIFI_PASS_STORED=PASS LENGTH=%u\n", (unsigned)value.length());
    }
  } else if (line == "WIFI_CONNECT") {
    WiFi.disconnect(true, false);
    delay(50);
    connectWifi();
  } else if (line == "CLEAR_WIFI") {
    prefs.remove("wifi_ssid");
    prefs.remove("wifi_pass");
    WiFi.disconnect(true, false);
    matrixIdentityVerified = false;
    Serial.println("HBNF_WIFI_CLEARED=PASS");
  } else if (line == "CLEAR_PADS") {
    prefs.remove("p1mac");
    prefs.remove("p2mac");
    pads[0] = pads[1] = nullptr;
    BP32.forgetBluetoothKeys();
    BP32.enableNewBluetoothConnections(true);
    Serial.println("HBNF_PADS_CLEARED=PASS");
  } else if (line == "PLAY_INFO") {
    Serial.printf("HBNF_PLAY_INFO SSID=%s PASS=%s URL=http://%s/\n", kPlaySsid, playPassword.c_str(), WiFi.softAPIP().toString().c_str());
  } else if (line == "PAIR_OPEN") {
    BP32.enableNewBluetoothConnections(true);
    Serial.println("HBNF_PAIRING=OPEN");
  } else if (line == "PAIR_LOCK") {
    BP32.enableNewBluetoothConnections(false);
    Serial.println("HBNF_PAIRING=LOCKED");
  } else {
    Serial.println("HBNF_SERIAL_ERROR=UNKNOWN_COMMAND");
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(250);
  prefs.begin("hbnfgame", false);
  startGameWeb();
  udp.begin(kLocalUdpPort);
  BP32.setup(&onConnectedController, &onDisconnectedController);
  BP32.enableNewBluetoothConnections(true);
  connectWifi();
  Serial.println("HBNF_GAME_BRIDGE_BOOT=PASS");
  printStatus();
}

void loop() {
  BP32.update();
  gameWeb.handleClient();
  gameWs.loop();
  captiveDns.processNextRequest();
  processSerial();
  const uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    static bool announced = false;
    if (!announced) {
      announced = true;
      matrixIdentityVerified = false;
      verifyMatrixIdentity();
      Serial.printf("HBNF_WIFI=ONLINE IP=%s\n", WiFi.localIP().toString().c_str());
    }
  } else if ((uint32_t)(now - lastWifiRetryAt) >= kWifiRetryMs) {
    lastWifiRetryAt = now;
    connectWifi();
  }

  const PadState physical1 = mapPad(pads[0]);
  const PadState physical2 = mapPad(pads[1]);
  if (physical1.connected && remoteInput.owner(0, now) >= 0) {
    const int owner = remoteInput.owner(0, now);
    gameWs.sendTXT(uint8_t(owner), "PREEMPTED,1");
    remoteInput.preempt(0);
  }
  if (physical2.connected && remoteInput.owner(1, now) >= 0) {
    const int owner = remoteInput.owner(1, now);
    gameWs.sendTXT(uint8_t(owner), "PREEMPTED,2");
    remoteInput.preempt(1);
  }
  PadState p1 = physical1.connected ? physical1 : remoteInput.pad(0, now);
  PadState p2 = physical2.connected ? physical2 : remoteInput.pad(1, now);
  const bool p1HasSessionAuthority = physical1.connected || remoteInput.privileged(0, now);
  const bool combo = p1HasSessionAuthority && p1.connected && p1.start && p1.select;
  const bool atMenu = games.mode() == GameManager::Mode::Menu;

  const SessionEvent event = lifecycle.update(combo, atMenu, now);
  if (!sessionActive && event == SessionEvent::Start) {
    if (!startSession(now)) lifecycle.forceEnd();
  } else if (sessionActive && event == SessionEvent::End) {
    endSession("USER_EXIT");
  }

  if (!sessionActive) {
    delay(2);
    return;
  }

  if (p1.connected) guard.controllerHeartbeat(now);

  if ((uint32_t)(now - lastProbeAt) >= kProbeMs) {
    lastProbeAt = now;
    sampleMatrix(now);
  }
  guard.tick(now);
  if (!guard.mayStream()) {
    endSession("SAFETY_WATCHDOG");
    delay(2);
    return;
  }

  if ((uint32_t)(now - lastFrameAt) >= kFrameMs) {
    const uint32_t dt = (uint32_t)(now - lastFrameAt);
    lastFrameAt = now;
    if (!(games.mode() == GameManager::Mode::Pong && !p2.connected)) {
      games.update(p1, p2, dt);
    }
    Framebuffer fb;
    games.render(fb);
    if (fb.rejectedWrites != 0) {
      endSession("FRAMEBUFFER_GUARD");
      delay(2);
      return;
    }
    sendFrame(fb);
  }

  delay(1);
}
