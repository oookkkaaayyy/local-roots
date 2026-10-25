#!/usr/bin/env python3
from __future__ import annotations
import pathlib,re,sys

if len(sys.argv)!=2:
    raise SystemExit("usage: apply_aux_r3.py <wled-root>")
root=pathlib.Path(sys.argv[1]).resolve()
p=root/"usermods/usermod_v2_animartrix/usermod_v2_animartrix.cpp"
s=p.read_text()

# This patch runs after apply_wowmax_v3.py. Keep the exact fixed effect IDs but
# convert the runtime identity and derive scene style/amount from the synced
# effect ID. WLED UDP sync carries effect/speed/intensity/palette/colors/timebase,
# but intentionally does not copy segment option/custom-slider data in the safe
# aux configuration. This deterministic map reconstructs c1/c2 without allowing
# Matrix geometry/options to overwrite the UV segments.
for old,new in [
 ("hbnf-wow-r3-max-2026-09-21-v3","hbnf-wow-aux-r3-2026-09-22-v1"),
 ("r3-wow-max","aux-r3-wow-1d"),
 ("registry28-tempo-lock-v9-network-no-starve","registry28-tempo-lock-1d-v6-network-no-starve"),
 ('root["HBNFWOW"]','root["HBNFAUX"]'),
 ('root.createNestedObject("HBNFWOW")','root.createNestedObject("HBNFAUX")'),
 ('PSTR("%s/wow")','PSTR("%s/auxwow")'),
]:
    s=s.replace(old,new)

mqtt_anchor='\\\"projectionLink\\\":\\\"frame-lock-v1\\\",'
mqtt_repl=mqtt_anchor+'\\\"projection\\\":\\\"fold2-1d-v1\\\",\\\"projectionRole\\\":\\\"receiver\\\",\\\"lumaPolicy\\\":\\\"camera-bright-v1\\\",'
if s.count(mqtt_anchor)!=1:
    raise RuntimeError(f"MQTT V4 projection anchor mismatch: {s.count(mqtt_anchor)}")
s=s.replace(mqtt_anchor,mqtt_repl,1)
if "char payload[" not in s:
    raise RuntimeError("V4 MQTT payload buffer anchor missing")

anchor="class ANIMartRIXMod:public ANIMartRIX {"
if s.count(anchor)!=1:
    raise RuntimeError("ANIMartRIXMod anchor mismatch")
style=[176,96,176,56,236,96,136,176,96,236,176,136,56,236,96,236,56,136,96,176,236,136,176,96,236,56,136,236]
amount=[178,218,168,218,188,225,180,190,176,205,182,195,220,210,180,202,218,205,224,188,200,190,175,205,215,220,190,205]
helpers="""static uint8_t hbnfAuxStyleForMode(uint8_t mode, uint8_t fallback) {
  static const uint8_t map[28] = {""" + ",".join(map(str,style)) + """};
  return (mode >= 220 && mode <= 247) ? map[mode-220] : fallback;
}
static uint8_t hbnfAuxAmountForMode(uint8_t mode, uint8_t fallback) {
  static const uint8_t map[28] = {""" + ",".join(map(str,amount)) + """};
  return (mode >= 220 && mode <= 247) ? map[mode-220] : fallback;
}
static void hbnfAuxLiftLuma(uint8_t &r, uint8_t &g, uint8_t &b) {
  const uint8_t peak = r > g ? (r > b ? r : b) : (g > b ? g : b);
  if (peak < 4) return; // keep intentional black / near-black pixels black
  uint16_t target = 56u + ((uint16_t)peak * 199u + 127u) / 255u;
  if (target < peak) target = peak;
  if (target > 255u) target = 255u;
  r = (uint8_t)(((uint16_t)r * target + peak/2u) / peak);
  g = (uint8_t)(((uint16_t)g * target + peak/2u) / peak);
  b = (uint8_t)(((uint16_t)b * target + peak/2u) / peak);
}

"""
s=s.replace(anchor,helpers+anchor,1)

# ANIMartRIX has selected effects that divide by (num_y-1). A native 1D
# WLED segment reports virtualHeight()==1, which would produce NaN/Inf in
# Hot_Blob and Lava1. Render on a two-row virtual canvas and fold the
# row-major pixels onto the physical 1D underglow instead.
init_pat=re.compile(r'''if \(\(SEGENV\.call == 0\) \|\| \(SEGMENT\.virtualWidth\(\) != num_x\) \|\| \(SEGMENT\.virtualHeight\(\) != num_y\)\) \{\s*init\(SEGMENT\.virtualWidth\(\), SEGMENT\.virtualHeight\(\), false\);\s*\}''')
init_new='''const int hbnfPhysicalLength = SEGMENT.virtualLength();
	  const int hbnfCanvasW = hbnfPhysicalLength > 0 ? (hbnfPhysicalLength + 1) / 2 : 1;
	  const int hbnfCanvasH = 2;
	  if ((SEGENV.call == 0) || (hbnfCanvasW != num_x) || (hbnfCanvasH != num_y)) {
		init(hbnfCanvasW, hbnfCanvasH, false);
	  }'''
s,n=init_pat.subn(init_new,s,count=1)
if n!=1:
    raise RuntimeError(f"fold2 init rewrite mismatch: {n}")

pixel_new='''\tvoid setPixelColor(int x, int y, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\thbnfAuxLiftLuma(r,g,b);
\t\tconst int index = y * num_x + x;
\t\tif (index >= 0 && index < SEGMENT.virtualLength()) SEGMENT.setPixelColor(index, CRGB(r,g,b));
\t}
\tvoid setPixelColor(int index, rgb pixel) {
\t\tuint8_t r=pixel.red,g=pixel.green,b=pixel.blue;
\t\tconst int x=num_x?(index%num_x):0, y=num_x?(index/num_x):0;
\t\thbnfAudio.modulate(x,y,r,g,b);
\t\tif (SEGMENT.check2) { r=gamma8(r); g=gamma8(g); b=gamma8(b); }
\t\thbnfAuxLiftLuma(r,g,b);
\t\tif (index >= 0 && index < SEGMENT.virtualLength()) SEGMENT.setPixelColor(index, CRGB(r,g,b));
\t}'''
pixel_pat=re.compile(r'''\tvoid hbnfVariantXY\(int x,int y,int &tx,int &ty\) const \{.*?\n\t\}\n\tvoid setPixelColor\(int x, int y, rgb pixel\) \{.*?\n\t\}\n\tvoid setPixelColor\(int index, rgb pixel\) \{.*?\n\t\}''',re.S)
s,n=pixel_pat.subn(pixel_new,s,count=1)
if n!=1:
    raise RuntimeError(f"fold2 pixel hook rewrite mismatch: {n}")


old="(hbnfAudio.setScene(SEGMENT.mode), hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, SEGMENT.custom1, SEGMENT.custom2, SEGMENT.virtualWidth(), SEGMENT.virtualHeight(), SEGMENT.custom3, (uint8_t)(SEGMENT.offset >> 8)))"
new="(hbnfAudio.setScene(SEGMENT.mode), hbnfAudio.beginFrame(speedFactor, millis(), SEGMENT.intensity, hbnfAuxStyleForMode(SEGMENT.mode, SEGMENT.custom1), hbnfAuxAmountForMode(SEGMENT.mode, SEGMENT.custom2), num_x, num_y, SEGMENT.custom3, (uint8_t)(SEGMENT.offset >> 8)))"
if s.count(old)!=1:
    raise RuntimeError(f"audio mapping anchor mismatch: {s.count(old)}")
s=s.replace(old,new,1)

# Install the frame-locked Matrix projection receiver. The Matrix broadcasts a
# 22-pixel downsample of its already-rendered framebuffer; AUX displays those
# pixels directly instead of independently re-running the effect/audio engine.
diag_anchor="class AnimartrixUsermod : public Usermod {"
if s.count(diag_anchor)!=1:
    raise RuntimeError("AUX projection receiver anchor mismatch")
receiver="""class HbnfProjectionReceiverV1 {
  WiFiUDP udp_, hello_;
  bool begun_=false, helloBegun_=false, haveSeq_=false;
  uint32_t lastPacketMs_=0, packets_=0, lastHelloMs_=0, helloPackets_=0;
  uint16_t seq_=0;
  IPAddress boundIp_;

  void resetSockets() {
    if (begun_) udp_.stop();
    if (helloBegun_) hello_.stop();
    begun_=false; helloBegun_=false;
    boundIp_=IPAddress();
  }

  void sendHello(uint32_t now) {
    if (!helloBegun_ || (lastHelloMs_ && now-lastHelloMs_<750u)) return;
    const IPAddress ip=WiFi.localIP(), mask=WiFi.subnetMask();
    IPAddress bc(
      (uint8_t)(ip[0]|(uint8_t)~mask[0]),
      (uint8_t)(ip[1]|(uint8_t)~mask[1]),
      (uint8_t)(ip[2]|(uint8_t)~mask[2]),
      (uint8_t)(ip[3]|(uint8_t)~mask[3]));
    uint8_t hello[hbnf::PROJECTION_HELLO_BYTES];
    hbnf::encodeProjectionHello((uint32_t)ESP.getEfuseMac(),hello);
    if (hello_.beginPacket(bc,hbnf::PROJECTION_DISCOVERY_PORT)) {
      hello_.write(hello,sizeof(hello));
      if (hello_.endPacket()) helloPackets_++;
    }
    lastHelloMs_=now;
  }

 public:
  void tick() {
    const uint32_t now=millis();
    if (WiFi.status()!=WL_CONNECTED) { resetSockets(); return; }

    const IPAddress currentIp=WiFi.localIP();
    if (!begun_ || !helloBegun_ || currentIp!=boundIp_) {
      resetSockets();
      begun_=udp_.begin(hbnf::PROJECTION_PORT);
      helloBegun_=hello_.begin(0);
      if (!begun_ || !helloBegun_) { resetSockets(); return; }
      boundIp_=currentIp;
      lastHelloMs_=0;
    }

    sendHello(now);

    bool got=false;
    uint16_t bestSeq=seq_;
    uint8_t best[hbnf::PROJECTION_PIXELS*3];

    // Always drain the receive queue and render only the newest valid frame.
    for (int guard=0;guard<128;guard++) {
      const int n=udp_.parsePacket();
      if (n<=0) break;
      uint8_t packet[hbnf::PROJECTION_PACKET_BYTES];
      if ((size_t)n!=sizeof(packet)) {
        while (udp_.available()) udp_.read();
        continue;
      }
      const int nr=udp_.read(packet,sizeof(packet));
      if (nr!=(int)sizeof(packet)) continue;
      uint16_t candidate=0;
      uint8_t rgb[hbnf::PROJECTION_PIXELS*3];
      if (!hbnf::decodeProjectionPacket(packet,sizeof(packet),candidate,rgb)) continue;
      if (haveSeq_) {
        const uint16_t delta=(uint16_t)(candidate-bestSeq);
        if (delta==0 || delta>32768u) continue;
      }
      memcpy(best,rgb,sizeof(best));
      bestSeq=candidate;
      got=true;
    }

    if (!got) return;
    realtimeLock(240,REALTIME_MODE_UDP);
    if (realtimeOverride) return;

    for (uint8_t i=0;i<hbnf::PROJECTION_PIXELS;i++) {
      uint8_t r=best[i*3],g=best[i*3+1],b=best[i*3+2];
      hbnf::projectionLiftLuma(r,g,b);
      strip.setRealtimePixelColor(i,RGBW32(r,g,b,0));
    }
    if (useMainSegmentOnly) strip.trigger(); else strip.show();

    seq_=bestSeq;
    haveSeq_=true;
    packets_++;
    lastPacketMs_=now;
  }

  bool active() const { return lastPacketMs_ && (millis()-lastPacketMs_<350u); }
  uint32_t ageMs() const { return lastPacketMs_?millis()-lastPacketMs_:0xffffffffu; }
  uint32_t packets() const { return packets_; }
  uint16_t seq() const { return seq_; }
  uint32_t helloPackets() const { return helloPackets_; }
};
static HbnfProjectionReceiverV1 hbnfProjectionRx;

"""
s=s.replace(diag_anchor,receiver+diag_anchor,1)

# AUX must never run the Matrix generator/sender. It only receives projected frames.
tick_old="""      hbnfProjectionTx.tick();
      if (strip.isUpdating()) return;
      hbnfGenV4.tick();"""
tick_new="""      hbnfProjectionRx.tick();
      if (strip.isUpdating()) return;"""
if s.count(tick_old)!=1:
    raise RuntimeError(f"AUX V4 tick anchor mismatch: {s.count(tick_old)}")
s=s.replace(tick_old,tick_new,1)

# Replace sender telemetry with receiver telemetry.
for old,new in [
 ('wow["projectionPackets"] = hbnfProjectionTx.packets();','wow["projectionRxPackets"] = hbnfProjectionRx.packets();\n      wow["projectionRxSeq"] = hbnfProjectionRx.seq();\n      wow["projectionRxActive"] = hbnfProjectionRx.active();\n      wow["projectionRxAgeMs"] = hbnfProjectionRx.ageMs();\n      wow["projectionHelloPackets"] = hbnfProjectionRx.helloPackets();\n      wow["projectionTransport"] = "udp-unicast-discovery-v1";\n      wow["projectionGeometry"] = "perimeter-5-6-5-6-v1";\n      wow["projectionScheduler"] = "network-before-bus-guard-v1";'),
 ('\\\"projectionPackets\\\":%lu,\\\"projectionSeq\\\":%u,','\\\"projectionRxPackets\\\":%lu,\\\"projectionRxSeq\\\":%u,'),
 ('(unsigned long)hbnfProjectionTx.packets(), hbnfProjectionTx.seq(),','(unsigned long)hbnfProjectionRx.packets(), hbnfProjectionRx.seq(),'),
]:
    if s.count(old)!=1:
        raise RuntimeError(f"AUX projection telemetry anchor mismatch for {old}: {s.count(old)}")
    s=s.replace(old,new,1)

# The generated Matrix state names its role implicitly; make AUX explicit.
state_proj='      wow["projectionLink"] = "frame-lock-v1";'
if s.count(state_proj)!=1:
    raise RuntimeError("AUX projectionLink state anchor missing")
s=s.replace(state_proj,state_proj+'\n      wow["projectionRole"] = "receiver";',1)

# Add 1D-specific diagnostics. A normal strip is virtualHeight()==1; ANIMartRIX
# therefore renders the same effect as a one-row projection while sharing the
# same WLED timebase as the Matrix sender.
needle='      wow["fxLast"] = hbnfFxLast;'
replacement=needle+'\n      wow["projection"] = "fold2-1d-v1";\n      wow["lumaPolicy"] = "camera-bright-v1";\n      wow["syncEffectContract"] = "ids220-247";\n      wow["sceneParams"] = "profile-via-ix-style-amount-by-effect-id";\n      wow["projectionQueuePolicy"] = "newest-frame-v1";'
if s.count(needle)!=1:
    raise RuntimeError("telemetry extension anchor mismatch")
s=s.replace(needle,replacement,1)
p.write_text(s)

# Make AudioReactive a network-audio receiver by default so the aux renderer
# can use the Matrix controller's FFT stream instead of a second microphone.
ar=root/"usermods/audioreactive/audio_reactive.cpp"
a=ar.read_text()
data_anchor='''        um_data->u_size = 8;
        um_data->u_type = new um_types_t[um_data->u_size];'''
data_replacement='''        um_data->u_size = 9;
        um_data->u_type = new um_types_t[um_data->u_size];'''
if a.count(data_anchor)!=1:
    raise RuntimeError(f"AudioReactive UMData size anchor mismatch: {a.count(data_anchor)}")
a=a.replace(data_anchor,data_replacement,1)
bin_anchor='''        um_data->u_data[7] = &binNum;          // assigned in effect function from UI element!!! (Puddlepeak, Ripplepeak, Waterfall)
        um_data->u_type[7] = UMT_BYTE;'''
bin_replacement=bin_anchor+'''\n        um_data->u_data[8] = &last_UDPTime;    // timestamp of last valid synced audio packet
        um_data->u_type[8] = UMT_UINT32;'''
if a.count(bin_anchor)!=1:
    raise RuntimeError(f"AudioReactive freshness export anchor mismatch: {a.count(bin_anchor)}")
a=a.replace(bin_anchor,bin_replacement,1)
old="static uint8_t audioSyncEnabled = 0;"
if a.count(old)!=1:
    raise RuntimeError(f"audioSyncEnabled anchor mismatch: {a.count(old)}")
a=a.replace(old,"static uint8_t audioSyncEnabled = 2;",1)
state_anchor='      usermod["on"] = enabled;'
if a.count(state_anchor)!=1:
    raise RuntimeError("AudioReactive state anchor mismatch")
a=a.replace(state_anchor,state_anchor+'\n      usermod["syncMode"] = audioSyncEnabled;\n      usermod["syncPort"] = audioSyncPort;',1)
ar.write_text(a)

checks={
 p:[
  "hbnf-wow-aux-r3-2026-09-22-v1","aux-r3-wow-1d","registry28-tempo-lock-1d-v6-network-no-starve",
  "hbnfAuxStyleForMode","hbnfAuxAmountForMode","hbnfCanvasH = 2","SEGMENT.virtualLength()",'root["HBNFAUX"]',
  'PSTR("%s/auxwow")','\\\"projection\\\":\\\"fold2-1d-v1\\\"','\\\"projectionRole\\\":\\\"receiver\\\"','\\\"lumaPolicy\\\":\\\"camera-bright-v1\\\"',
  'wow["projection"] = "fold2-1d-v1"','wow["projectionRole"] = "receiver"','wow["projectionRxPackets"]','wow["lumaPolicy"] = "camera-bright-v1"',
  "hbnfAuxLiftLuma","HbnfProjectionReceiverV1","hbnfProjectionRx.tick()","source-coupled-v4","frame-lock-v1",
  'strip.addEffect(220, &mode_Complex_Kaleido_3','strip.addEffect(247, &mode_Module_Experiment10'
 ],
 ar:["static uint8_t audioSyncEnabled = 2;",'usermod["syncMode"] = audioSyncEnabled','usermod["syncPort"] = audioSyncPort','um_data->u_size = 9','um_data->u_data[8] = &last_UDPTime','um_data->u_type[8] = UMT_UINT32']
}
for path,needles in checks.items():
    text=path.read_text()
    for n in needles:
        if n not in text: raise RuntimeError(f"missing postcondition {n} in {path}")
if "hbnf-wow-r3-max-2026-09-21-v3" in p.read_text():
    raise RuntimeError("matrix release identity leaked into aux source")
if "hbnfProjectionTx.tick();" in p.read_text() or "hbnfGenV4.tick();" in p.read_text():
    raise RuntimeError("AUX must not run Matrix projection sender or generative owner")
print("HBNF_AUX_V4_PROJECTION_RECEIVER_SOURCE_PATCH_PASS")
