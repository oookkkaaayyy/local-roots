#include <Arduino.h>
#include <Bluepad32.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WiFiClientSecure.h>
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
constexpr const char* kCartControlUrl = "https://phcpbvuqibyarpfrftgx.supabase.co/functions/v1/hbnf-cart-control";

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
uint32_t lastWifiRetryAt = 0;
uint64_t sampleRevision = 0;

struct MatrixProbeSnapshot {
  bool ready = false;
  bool ok = false;
  bool on = false;
  uint8_t brightness = 0;
  uint32_t sampledAt = 0;
  uint32_t durationMs = 0;
  uint32_t generation = 0;
};
SemaphoreHandle_t matrixProbeMutex = nullptr;
MatrixProbeSnapshot matrixProbeShared;
uint32_t matrixProbeConsumedGeneration = 0;
bool sessionActive = false;
bool matrixIdentityVerified = false;
bool guestPlayEnabled = true;
String playPassword;
String cartDeviceToken;
int cartRevisionCache = -1;
SemaphoreHandle_t cartProxyMutex = nullptr;
bool cartJobPending = false;
bool cartJobBusy = false;
uint8_t cartJobClient = 0;
String cartJobType;
String cartJobPayload;
bool cartResultReady = false;
uint8_t cartResultClient = 0;
bool cartResultOk = false;
String cartResultDetail;

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

void matrixProbeWorker(void*) {
  uint32_t generation = 0;
  for (;;) {
    MatrixProbeSnapshot snap;
    snap.sampledAt = millis();
    const uint32_t startedAt = snap.sampledAt;

    if (WiFi.status() == WL_CONNECTED) {
      String body;
      bool on = false;
      int bri = -1;
      snap.ok = httpGet("/json/state", body) &&
                parseJsonBool(body, "on", on) &&
                parseJsonIntAfter(body, "", "bri", bri);
      if (snap.ok) {
        snap.on = on;
        snap.brightness = (uint8_t)constrain(bri, 0, 255);
      }
    }

    snap.durationMs = (uint32_t)(millis() - startedAt);
    snap.ready = true;
    snap.generation = ++generation;

    if (matrixProbeMutex && xSemaphoreTake(matrixProbeMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      matrixProbeShared = snap;
      xSemaphoreGive(matrixProbeMutex);
    }

    vTaskDelay(pdMS_TO_TICKS(kProbeMs));
  }
}

void pumpMatrixProbe() {
  if (!matrixProbeMutex) return;
  MatrixProbeSnapshot snap;
  bool have = false;
  if (xSemaphoreTake(matrixProbeMutex, 0) == pdTRUE) {
    if (matrixProbeShared.ready &&
        matrixProbeShared.generation != matrixProbeConsumedGeneration) {
      snap = matrixProbeShared;
      matrixProbeConsumedGeneration = matrixProbeShared.generation;
      have = true;
    }
    xSemaphoreGive(matrixProbeMutex);
  }
  if (!have || !snap.ok) return;

  CanonicalSample sample;
  sample.reachable = true;
  sample.powerOn = snap.on && snap.brightness > 0;
  sample.matrixOnline = true;
  sample.brightness = snap.brightness;
  sample.revision = ++sampleRevision;
  sample.observedRevision = sample.revision;
  guard.ingestCanonical(sample, snap.sampledAt);
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



String commandUuid() {
  uint8_t b[16];
  for (uint8_t i=0;i<16;i+=4) {
    uint32_t r=esp_random();
    memcpy(b+i,&r,4);
  }
  b[6]=(b[6]&0x0f)|0x40;
  b[8]=(b[8]&0x3f)|0x80;
  char out[37];
  snprintf(out,sizeof(out),
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(out);
}

bool cartApiPost(const String& body, String& responseBody, int& statusCode) {
  if (WiFi.status()!=WL_CONNECTED || cartDeviceToken.length()<20) return false;
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(1800);
  http.setTimeout(2200);
  if (!http.begin(client,kCartControlUrl)) return false;
  http.addHeader("Content-Type","application/json");
  http.addHeader("x-hbnf-device",cartDeviceToken);
  statusCode=http.POST(body);
  responseBody=http.getString();
  http.end();
  return statusCode>0;
}

bool currentCartRevision(int& revision) {
  String body; int code=0;
  if (!cartApiPost("{\"action\":\"status\"}",body,code) || code!=200) return false;
  if (!parseJsonIntAfter(body,"\"desired\":","revision",revision)) return false;
  cartRevisionCache=revision;
  return true;
}

bool guestCartCommand(const String& type, const String& payload, String& error) {
  int revision=cartRevisionCache;
  if (revision<0 && !currentCartRevision(revision)) { error="STATUS_UNAVAILABLE"; return false; }
  String body="{\"action\":\"command\",\"commandId\":\""+commandUuid()+"\",\"type\":\""+type+
              "\",\"payload\":"+payload+",\"expectedRevision\":"+String(revision)+"}";
  String out; int code=0;
  if (!cartApiPost(body,out,code)) { error="NETWORK"; return false; }
  if (code>=200 && code<300) {
    int committed=-1;
    if (parseJsonIntAfter(out,"","revision",committed)) cartRevisionCache=committed;
    else cartRevisionCache=-1;
    return true;
  }
  if (code==409 && out.indexOf("stale_revision")>=0) {
    if (!currentCartRevision(revision)) { error="STALE"; return false; }
    body="{\"action\":\"command\",\"commandId\":\""+commandUuid()+"\",\"type\":\""+type+
         "\",\"payload\":"+payload+",\"expectedRevision\":"+String(revision)+"}";
    if (cartApiPost(body,out,code) && code>=200 && code<300) {
      int committed=-1;
      if (parseJsonIntAfter(out,"","revision",committed)) cartRevisionCache=committed;
      else cartRevisionCache=-1;
      return true;
    }
  }
  error=String("HTTP_")+String(code);
  return false;
}


bool queueCartProxy(uint8_t client, const String& type, const String& payload) {
  if (!cartProxyMutex) return false;
  if (xSemaphoreTake(cartProxyMutex, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  if (cartJobPending) {
    xSemaphoreGive(cartProxyMutex);
    return false;
  }
  cartJobClient = client;
  cartJobType = type;
  cartJobPayload = payload;
  cartJobPending = true;
  xSemaphoreGive(cartProxyMutex);
  return true;
}

void cartProxyWorker(void*) {
  for (;;) {
    bool have = false;
    uint8_t client = 0;
    String type, payload;
    if (cartProxyMutex && xSemaphoreTake(cartProxyMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      if (cartJobPending && !cartJobBusy && !cartResultReady) {
        cartJobBusy = true;
        cartJobPending = false;
        client = cartJobClient;
        type = cartJobType;
        payload = cartJobPayload;
        have = true;
      }
      xSemaphoreGive(cartProxyMutex);
    }
    if (!have) {
      vTaskDelay(pdMS_TO_TICKS(8));
      continue;
    }

    String error;
    const bool ok = guestCartCommand(type, payload, error);

    if (xSemaphoreTake(cartProxyMutex, portMAX_DELAY) == pdTRUE) {
      cartResultClient = client;
      cartResultOk = ok;
      cartResultDetail = ok ? type : error;
      cartResultReady = true;
      cartJobBusy = false;
      xSemaphoreGive(cartProxyMutex);
    }
  }
}

void pumpCartProxyResult() {
  if (!cartProxyMutex) return;
  bool ready = false, ok = false;
  uint8_t client = 0;
  String detail;
  if (xSemaphoreTake(cartProxyMutex, 0) == pdTRUE) {
    if (cartResultReady) {
      ready = true;
      ok = cartResultOk;
      client = cartResultClient;
      detail = cartResultDetail;
      cartResultReady = false;
      cartResultDetail = "";
    }
    xSemaphoreGive(cartProxyMutex);
  }
  if (ready) gameWs.sendTXT(client, String(ok ? "CARTOK," : "CARTERR,") + detail);
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
    gameWs.sendTXT(num, String("HELLO,") + (host ? "HOST" : "GUEST") + ",1," +
                       (sessionActive ? "1" : "0") + "," + (cartDeviceToken.length() >= 20 ? "1" : "0"));
    return;
  }
  if (type != WStype_TEXT) return;
  String msg((char*)payload, length);
  const bool host = isHostClient(num);

  if (msg.startsWith("PING,")) {
    gameWs.sendTXT(num, String("PONG,") + msg.substring(5));
    return;
  }
  if (msg == "CLAIM_AUTO") {
    for (uint8_t slot=0;slot<2;++slot) {
      const bool physical = pads[slot] && pads[slot]->isConnected();
      const auto result = remoteInput.claim(num, slot, host, millis(), physical);
      if (result == RemoteInputBroker::Claim::Ok) {
        gameWs.sendTXT(num, String("CLAIMED,") + String(slot+1));
        if (!sessionActive) {
          const uint32_t now=millis();
          if (startSession(now)) lifecycle.forceStart();
        }
        broadcastGameState();
        return;
      }
    }
    gameWs.sendTXT(num,"ERR,NO_PLAYER_SLOT_FREE");
    return;
  }
  if (msg.startsWith("CART,")) {
    if (cartDeviceToken.length()<20) { gameWs.sendTXT(num,"CARTERR,NOT_PROVISIONED"); return; }
    String cmd=msg.substring(5), type, payload="{}";
    if (cmd=="OFF"||cmd=="ON"||cmd=="NEXT"||cmd=="AUTO"||cmd=="LOCK"||cmd=="VIBE_AUTO"||cmd=="TEMPO_AUTO") {
      type=cmd;
    } else if (cmd.startsWith("BRIGHTNESS,")) {
      int comma=cmd.indexOf(',',11);
      if (comma<0) { gameWs.sendTXT(num,"CARTERR,BAD_COMMAND"); return; }
      String device=cmd.substring(11,comma);
      int value=constrain(cmd.substring(comma+1).toInt(),0,255);
      if (device!="matrix"&&device!="aux") { gameWs.sendTXT(num,"CARTERR,BAD_DEVICE"); return; }
      type="BRIGHTNESS";
      payload=String("{\"deviceId\":\"")+device+"\",\"brightness\":"+String(value)+"}";
    } else if (cmd.startsWith("VIBE,")) {
      String vibe=cmd.substring(5);
      if (vibe!="mellow"&&vibe!="moderate"&&vibe!="energetic"&&vibe!="peak") { gameWs.sendTXT(num,"CARTERR,BAD_VIBE"); return; }
      type="VIBE"; payload=String("{\"vibe\":\"")+vibe+"\"}";
    } else if (cmd.startsWith("SPEED,")) {
      float speed=cmd.substring(6).toFloat();
      if (speed<0.5f||speed>2.0f) { gameWs.sendTXT(num,"CARTERR,BAD_SPEED"); return; }
      type="SPEED"; payload=String("{\"speedBias\":")+String(speed,2)+"}";
    } else {
      gameWs.sendTXT(num,"CARTERR,BAD_COMMAND"); return;
    }
    if (!queueCartProxy(num,type,payload)) gameWs.sendTXT(num,"CARTERR,BUSY");
    else gameWs.sendTXT(num,"CARTQUEUED");
    return;
  }
  if (msg == "RELEASE") {
    releaseRemoteClient(num);
    return;
  }
  if (msg.startsWith("CLAIM,")) {
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
    remoteInput.update(num, uint8_t(requested-1), mask, millis());
    return;
  }
  if (msg.startsWith("GUEST,")) { guestPlayEnabled=true; broadcastGameState(); return; }
  if (msg == "SESSION,START") {
    if (!sessionActive) {
      const uint32_t now = millis();
      if (startSession(now)) lifecycle.forceStart(); // keep host-web and gamepad session lifecycle identical
      else gameWs.sendTXT(num, "ERR,SESSION_START_BLOCKED");
      broadcastGameState();
    }
    return;
  }
  if (msg == "SESSION,END") {
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
  gameWeb.on("/ncsi.txt", HTTP_GET, serveController);
  gameWeb.on("/redirect", HTTP_GET, serveController);
  gameWeb.on("/fwlink", HTTP_GET, serveController);
  gameWeb.on("/library/test/success.html", HTTP_GET, serveController);
  gameWeb.on("/success.txt", HTTP_GET, serveController);
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
  guestPlayEnabled = true;
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
  Serial.println("HBNF_GAME_SESSION_START=PASS");
  return true;
}

void connectWifi() {
  cartRevisionCache=-1;
  const String ssid = prefs.getString("wifi_ssid", kDefaultSsid);
  const String pass = prefs.getString("wifi_pass", "");
  if (pass.length() == 0) {
    Serial.println("HBNF_WIFI=NEEDS_PROVISIONING");
    return;
  }
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  const bool ipOk = WiFi.config(
    IPAddress(192,168,8,30),
    IPAddress(192,168,8,1),
    IPAddress(255,255,255,0),
    IPAddress(192,168,8,1)
  );
  if (!ipOk) Serial.println("HBNF_WIFI_STATIC_IP=FAIL");
  else Serial.println("HBNF_WIFI_STATIC_IP=192.168.8.30");
  WiFi.begin(ssid.c_str(), pass.c_str());
  Serial.printf("HBNF_WIFI_CONNECTING SSID=%s\n", ssid.c_str());
}

void printStatus() {
  uint8_t p1[6], p2[6];
  readMac("p1mac", p1);
  readMac("p2mac", p2);
  Serial.printf("HBNF_STATUS WIFI=%s IP=%s MATRIX=%s SESSION=%s P1=%s P2=%s PLAYSSID=%s PLAYPASS=%s CARTPROXY=%s\n",
                WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE",
                WiFi.localIP().toString().c_str(),
                matrixIdentityVerified ? "VERIFIED" : "UNVERIFIED",
                sessionActive ? "ACTIVE" : "IDLE",
                macEmpty(p1) ? "UNSET" : macString(p1).c_str(),
                macEmpty(p2) ? "UNSET" : macString(p2).c_str(),
                kPlaySsid, playPassword.c_str(),
                cartDeviceToken.length() >= 20 ? "READY" : "NOT_READY");
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
    WiFi.disconnect(false, false);
    delay(50);
    connectWifi();
  } else if (line == "CLEAR_WIFI") {
    prefs.remove("wifi_ssid");
    prefs.remove("wifi_pass");
    WiFi.disconnect(false, false);
    matrixIdentityVerified = false;
    Serial.println("HBNF_WIFI_CLEARED=PASS");
  } else if (line == "CLEAR_PADS") {
    prefs.remove("p1mac");
    prefs.remove("p2mac");
    pads[0] = pads[1] = nullptr;
    BP32.forgetBluetoothKeys();
    BP32.enableNewBluetoothConnections(true);
    Serial.println("HBNF_PADS_CLEARED=PASS");
  } else if (line.startsWith("CART_TOKEN ")) {
    String value=line.substring(11); value.trim();
    if (value.length()>=20) {
      prefs.putString("cart_token",value);
      cartDeviceToken=value;
      Serial.println("HBNF_CART_TOKEN_STORED=PASS");
    } else Serial.println("HBNF_CART_TOKEN_STORED=FAIL");
  } else if (line == "CLEAR_CART_TOKEN") {
    prefs.remove("cart_token"); cartDeviceToken="";
    Serial.println("HBNF_CART_TOKEN_CLEARED=PASS");
  } else if (line == "PLAY_INFO") {
    Serial.printf("HBNF_PLAY_INFO SSID=%s PASS=%s URL=http://%s/ CART=%s\n", kPlaySsid, playPassword.c_str(), WiFi.softAPIP().toString().c_str(), cartDeviceToken.length()>=20 ? "READY" : "NOT_READY");
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
  cartDeviceToken=prefs.getString("cart_token","");
  cartProxyMutex=xSemaphoreCreateMutex();
  if (!cartProxyMutex) Serial.println("HBNF_CART_PROXY_MUTEX=FAIL");
  else if (xTaskCreatePinnedToCore(cartProxyWorker,"hbnf-cart-proxy",12288,nullptr,1,nullptr,0)!=pdPASS)
    Serial.println("HBNF_CART_PROXY_TASK=FAIL");
  else Serial.println("HBNF_CART_PROXY_TASK=PASS");

  matrixProbeMutex=xSemaphoreCreateMutex();
  if (!matrixProbeMutex) Serial.println("HBNF_MATRIX_PROBE_MUTEX=FAIL");
  else if (xTaskCreatePinnedToCore(matrixProbeWorker,"hbnf-matrix-probe",8192,nullptr,1,nullptr,0)!=pdPASS)
    Serial.println("HBNF_MATRIX_PROBE_TASK=FAIL");
  else Serial.println("HBNF_MATRIX_PROBE_TASK=PASS");

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
  pumpCartProxyResult();
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
  const bool p1HasSessionAuthority = p1.connected;
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

  // Safety polling runs on core 0. The 30 FPS render/input loop never performs
  // synchronous HTTP, so a slow Matrix status request cannot create gameplay
  // hitches or catch-up bursts.
  pumpMatrixProbe();
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
