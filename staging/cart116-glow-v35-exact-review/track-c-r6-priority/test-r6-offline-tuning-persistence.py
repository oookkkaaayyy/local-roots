#!/usr/bin/env python3
"""Focused executable tests against exactly extracted R6 C++ config methods, no device."""
import hashlib, json, pathlib, re, subprocess, sys, tempfile

source = pathlib.Path(sys.argv[1]).read_text()
report = pathlib.Path(sys.argv[2])
def extract(signature):
    hit = source.find(signature)
    assert hit >= 0 and source.find(signature, hit + len(signature)) < 0, signature
    begin = source.index("{", hit)
    depth = 0
    for i in range(begin, len(source)):
        if source[i] == "{": depth += 1
        if source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[hit:i+1].replace(" override {", " {", 1)
    raise AssertionError("unbalanced " + signature)
add = extract("void addToConfig(JsonObject& root) override")
read = extract("bool readFromConfig(JsonObject& root) override")
dirty = "if(settingsChanged||vibeChanged||renderChanged) runtime.markConfigDirty(millis());"
assert source.count(dirty) == 1
assert source.count("if (configDirty_ && (uint32_t)(now-configDirtyAt_) >= 850u)") == 1
assert source.count("native-overlay-owner-text-priority-v1") == 1
assert source.count("offline-tuning-persistence-v1") == 1
assert source.count("hbnf-cart2-r6-owner-safe-tuning-persist-review-20261104") == 3
assert "const uint8_t* fft = reinterpret_cast<const uint8_t*>(um->u_data[2]);" in source
harness = r"""
#include <cassert>
#include <cstdint>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <type_traits>
using std::uint8_t;
using std::uint32_t;
struct Node {
  enum Kind { Null, Object, Number } kind = Null;
  int value = 0;
  std::map<std::string,std::shared_ptr<Node>> members;
};
class J {
  std::shared_ptr<Node> n_;
 public:
  J():n_(std::make_shared<Node>()){}
  explicit J(std::shared_ptr<Node> p):n_(p){}
  static J object(){ J j; j.n_->kind=Node::Object; return j; }
  bool isNull() const { return n_->kind==Node::Null; }
  J operator[](const char* key) {
    auto& p=n_->members[key];
    if(!p)p=std::make_shared<Node>();
    return J(p);
  }
  J createNestedObject(const char* key) {
    J out=(*this)[key];out.n_->kind=Node::Object;return out;
  }
  template<typename T> bool is() const { return std::is_same<T,int>::value && n_->kind==Node::Number; }
  template<typename T> T as() const { return static_cast<T>(n_->value); }
  int operator|(int fallback) const { return n_->kind==Node::Number?n_->value:fallback; }
  template<typename T,typename std::enable_if<std::is_integral<T>::value,int>::type =0>
  J& operator=(T value) { n_->kind=Node::Number;n_->value=static_cast<int>(value);return *this; }
};
using JsonObject=J;
enum Scene : uint8_t { COURSE_FLOW=0, FIELD_MIX=1, SIGNATURE=2, QUIET_COSMOS=3 };
enum Vibe : uint8_t { VIBE_CHILL=0, VIBE_GROOVE=1, VIBE_HEAVY=2, VIBE_PSYCHEDELIC=3, VIBE_COSMIC=4, VIBE_AUTO=5 };
struct Controls {
  uint8_t audioResponse=50,motion=50,matrixBrightness=24,auxBrightness=24;
  Scene scene=COURSE_FLOW;Vibe vibe=VIBE_CHILL;
};
struct Runtime {
  Controls c;
  int chooseCount=0,invalidations=0,dirtyCount=0;
  Controls& controls(){return c;}
  void restoreSettings(uint8_t m,uint8_t a){c.matrixBrightness=m;c.auxBrightness=a;}
  void chooseSceneVariant(uint32_t){++chooseCount;}
  void invalidateFrame(){++invalidations;}
  void markConfigDirty(uint32_t){++dirtyCount;}
} runtime;
uint32_t millis(){return 1000u;}
class UnderTest {
 public:
__ADD__
__READ__
};
void changed(bool settingsChanged,bool vibeChanged,bool renderChanged) {
  __DIRTY__
}
int main(){
  UnderTest tested;
  // Existing saved config: missing new keys must preserve valid old brightness and Vibe.
  JsonObject old=J::object();
  JsonObject prior=old.createNestedObject("hbnfFoundationV1");
  prior["matrixBrightness"]=47;prior["auxBrightness"]=62;prior["vibe"]=2;
  runtime=Runtime{};
  assert(tested.readFromConfig(old));
  assert(runtime.c.matrixBrightness==47&&runtime.c.auxBrightness==62&&runtime.c.vibe==VIBE_HEAVY);
  assert(runtime.c.motion==50&&runtime.c.audioResponse==50&&runtime.c.scene==COURSE_FLOW);
  assert(runtime.chooseCount==0);
  // New config round-trip, including a nondefault scene chosen on boot.
  runtime=Runtime{};runtime.c.motion=84;runtime.c.audioResponse=91;
  runtime.c.scene=FIELD_MIX;runtime.c.vibe=VIBE_COSMIC;
  runtime.c.matrixBrightness=137;runtime.c.auxBrightness=70;
  JsonObject stored=J::object();tested.addToConfig(stored);
  runtime=Runtime{};
  assert(tested.readFromConfig(stored));
  assert(runtime.c.motion==84&&runtime.c.audioResponse==91&&runtime.c.scene==FIELD_MIX);
  assert(runtime.c.matrixBrightness==137&&runtime.c.auxBrightness==70&&runtime.c.vibe==VIBE_COSMIC);
  assert(runtime.chooseCount==1&&runtime.invalidations==1);
  // Valid boundaries 0/100, and no accidental scene transition when unchanged.
  JsonObject bounds=J::object();JsonObject bh=bounds.createNestedObject("hbnfFoundationV1");
  bh["matrixBrightness"]=4;bh["auxBrightness"]=5;bh["motion"]=0;bh["audioResponse"]=100;bh["scene"]=0;
  runtime=Runtime{};assert(tested.readFromConfig(bounds));
  assert(runtime.c.motion==0&&runtime.c.audioResponse==100&&runtime.c.scene==COURSE_FLOW);
  assert(runtime.chooseCount==0);
  // Invalid persisted values do not override defaults.
  bh["motion"]=-1;bh["audioResponse"]=101;bh["scene"]=4;bh["vibe"]=8;
  runtime=Runtime{};assert(tested.readFromConfig(bounds));
  assert(runtime.c.motion==50&&runtime.c.audioResponse==50&&runtime.c.scene==COURSE_FLOW);
  assert(runtime.c.vibe==VIBE_CHILL);
  // Missing config remains incomplete per original R6 contract.
  runtime=Runtime{};JsonObject empty=J::object();
  assert(!tested.readFromConfig(empty));
  assert(runtime.c.motion==50&&runtime.c.audioResponse==50);
  // Each changed setting class dirties config; an unchanged input does not.
  runtime=Runtime{};changed(false,false,false);assert(runtime.dirtyCount==0);
  changed(true,false,false);changed(false,true,false);changed(false,false,true);
  assert(runtime.dirtyCount==3);
  std::cout<<"PASS: legacy config, new roundtrip, boundaries, invalids, absence, dirty triggers\n";
}
"""
harness = harness.replace("__ADD__", add).replace("__READ__", read).replace("__DIRTY__", dirty)
with tempfile.TemporaryDirectory() as td:
    p = pathlib.Path(td)
    cpp=p/"test.cpp"; exe=p/"test"
    cpp.write_text(harness)
    compile=subprocess.run(["g++","-std=c++17","-Wall","-Wextra","-Werror","-pedantic",str(cpp),"-o",str(exe)],text=True,capture_output=True)
    assert compile.returncode==0, compile.stdout+"\n"+compile.stderr
    executed=subprocess.run([str(exe)],text=True,capture_output=True)
    assert executed.returncode==0, executed.stdout+"\n"+executed.stderr
result={
 "schema":"hbnf-cart116-r6-persistence-focused-v1",
 "status":"PASS",
 "tests":["accepted Owner feature retained","unique review-only marker","local AudioReactive FFT pointer retained",
 "850ms config-debounce anchor retained","legacy saved brightness/Vibe config",
 "new Motion/AudioResponse/scene + brightness/Vibe roundtrip",
 "valid boundary values","reject invalid persisted tuning and Vibe",
 "missing-config legacy semantics","select variant after scene restore",
 "only changed settings trigger dirty flag","actual patched C++ methods compiled and executed"],
 "candidate_cpp_sha256":hashlib.sha256(source.encode()).hexdigest(),
 "compile":"g++ -std=c++17 -Wall -Wextra -Werror -pedantic",
 "device_execution":False, "firmware_compile":False
}
report.write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
