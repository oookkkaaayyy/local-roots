#include "wled.h"
#include "hbnf_foundation_v1.h"

using hbnf_v1::AudioFrame;
using hbnf_v1::ControlState;
using hbnf_v1::makeAudioFrame;

static const char HBNF_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HBNF Local</title><style>
body{font:16px system-ui;background:#081116;color:#eef;margin:0 auto;max-width:640px;padding:20px}
label{display:grid;grid-template-columns:1fr auto;gap:8px;margin:18px 0}
input[type=range]{grid-column:1/-1;width:100%}output{font-variant-numeric:tabular-nums}
small{color:#9ab}h1{font-size:1.4rem}
</style></head><body><h1>HBNF Local Control</h1>
<small>Direct Matrix LAN control. No cloud in the live path.</small>
<div id="controls"></div>
<pre id="audio"></pre>
<script>
const defs=[
 ['mb','Matrix brightness'],['ab','Underglow brightness'],
 ['motion','Motion'],['audio','Audio response'],['var','Variation']
];
const root=document.querySelector('#controls');
for(const [id,label] of defs){
 const l=document.createElement('label'); l.innerHTML='<span>'+label+'</span><output>50</output><input type="range" min="0" max="100" value="50">';
 const input=l.querySelector('input'), out=l.querySelector('output'); input.id=id;
 input.oninput=()=>out.value=input.value;
 input.onchange=()=>fetch('/hbnf/v1/set?'+id+'='+encodeURIComponent(input.value),{cache:'no-store'});
 root.appendChild(l);
}
async function refresh(){
 try{
  const s=await (await fetch('/hbnf/v1/state',{cache:'no-store'})).json();
  const map={mb:s.control.matrixBrightness,ab:s.control.auxBrightness,motion:s.control.motion,audio:s.control.audioResponse,var:s.control.variation};
  for(const [id,v] of Object.entries(map)){const e=document.getElementById(id);if(document.activeElement!==e){e.value=v;e.parentElement.querySelector('output').value=v}}
  document.querySelector('#audio').textContent='low '+s.audio.low+'  mid '+s.audio.mid+'  high '+s.audio.high+'  vol '+s.audio.volume;
 }catch{}
}
setInterval(refresh,250); refresh();
</script></body></html>
)rawliteral";

class HbnfFoundationV1Usermod : public Usermod {
  ControlState control_;
  AudioFrame audio_;
  uint32_t audioSeq_ = 0;
  uint32_t lastAudioReadMs_ = 0;

  static uint8_t arg100(AsyncWebServerRequest* request, const char* name, uint8_t fallback) {
    if (!request->hasParam(name)) return fallback;
    long v=request->getParam(name)->value().toInt();
    if(v<0) v=0; if(v>100) v=100;
    return (uint8_t)v;
  }

  void sendState(AsyncWebServerRequest* request) {
    char body[512];
    snprintf(body,sizeof(body),
      R"json({"schema":"hbnf-foundation-v1","control":{"matrixBrightness":%u,"auxBrightness":%u,"motion":%u,"audioResponse":%u,"variation":%u},"audio":{"sequence":%lu,"timestampMs":%lu,"volume":%u,"low":%u,"mid":%u,"high":%u,"peak":%s}})json",
      control_.matrixBrightness,control_.auxBrightness,control_.motion,control_.audioResponse,control_.variation,
      (unsigned long)audio_.sequence,(unsigned long)audio_.timestampMs,audio_.volume,audio_.low,audio_.mid,audio_.high,audio_.peak?"true":"false");
    auto* response=request->beginResponse(200,"application/json",body);
    response->addHeader("Cache-Control","no-store");
    request->send(response);
  }

  void captureAudio() {
    const uint32_t now=millis();
    if(now-lastAudioReadMs_<20u) return;
    lastAudioReadMs_=now;
    um_data_t* um=nullptr;
    if(!UsermodManager::getUMData(&um,USERMOD_ID_AUDIOREACTIVE) || !um || um->u_size<4 || !um->u_data) return;
    if(!um->u_data[0] || !um->u_data[2] || !um->u_data[3]) return;
    const float volume=*reinterpret_cast<float*>(um->u_data[0]);
    const uint8_t* fft=reinterpret_cast<uint8_t*>(um->u_data[2]);
    const bool peak=*reinterpret_cast<uint8_t*>(um->u_data[3])!=0;
    audio_=makeAudioFrame(++audioSeq_,now,volume,fft,peak);
  }

 public:
  void setup() override {
    noWifiSleep=true;

    server.on("/hbnf",HTTP_GET,[](AsyncWebServerRequest* request){
      request->send_P(200,"text/html",HBNF_PAGE);
    });

    server.on("/hbnf/v1/state",HTTP_GET,[this](AsyncWebServerRequest* request){
      sendState(request);
    });

    server.on("/hbnf/v1/set",HTTP_GET,[this](AsyncWebServerRequest* request){
      control_.matrixBrightness=arg100(request,"mb",control_.matrixBrightness);
      control_.auxBrightness=arg100(request,"ab",control_.auxBrightness);
      control_.motion=arg100(request,"motion",control_.motion);
      control_.audioResponse=arg100(request,"audio",control_.audioResponse);
      control_.variation=arg100(request,"var",control_.variation);
      sendState(request);
    });
  }

  void loop() override { captureAudio(); }

  void addToJsonInfo(JsonObject& root) override {
    JsonObject user=root["u"];
    if(user.isNull()) user=root.createNestedObject("u");
    JsonArray status=user.createNestedArray("HBNF Foundation");
    status.add("V1 local-first");
  }
};

static HbnfFoundationV1Usermod hbnf_foundation_v1;
REGISTER_USERMOD(hbnf_foundation_v1);
