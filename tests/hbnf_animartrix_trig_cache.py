#!/usr/bin/env python3
"""Host-side bit-exact check for the Packet20 render_value trig-pair cache."""
import pathlib, shutil, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
patch=(ROOT/'firmware/packet20/animartrix-render-value-trig-cache.patch').read_text()
for marker in ('cached_angle_bits','memcpy(&angle_bits, &animation.angle','cached_cos = cosf(animation.angle)','cached_sin = sinf(animation.angle)','cached_cos * animation.dist','cached_sin * animation.dist'):
    assert marker in patch, marker
source=r'''#include <cmath>
#include <cstdint>
#include <cstring>
#include <cassert>
#include <vector>
struct Pair { float c,s; };
Pair cached(float a) {
 static uint32_t key=0; static float c=0,s=0; static bool valid=false;
 uint32_t bits=0; std::memcpy(&bits,&a,sizeof(bits));
 if(!valid || bits!=key){ key=bits;c=std::cos(a);s=std::sin(a);valid=true; }
 return {c,s};
}
Pair direct(float a){ return {std::cos(a),std::sin(a)}; }
bool same(float a,float b){ return std::memcmp(&a,&b,sizeof(float))==0; }
int main(){
 std::vector<float> values={0.0f,-0.0f,1.0f,-1.0f,3.1415927f,-3.1415927f,INFINITY,-INFINITY,NAN};
 uint32_t x=0x12345678u;
 for(int i=0;i<100000;i++){ x^=x<<13;x^=x>>17;x^=x<<5; float a; std::memcpy(&a,&x,sizeof(a)); values.push_back(a); }
 for(size_t i=0;i<values.size();i++){ auto d=direct(values[i]);auto c=cached(values[i]);assert(same(d.c,c.c));assert(same(d.s,c.s)); if(i%5==0){auto again=cached(values[i]);assert(same(d.c,again.c)&&same(d.s,again.s));}}
 assert(!same(cached(0.0f).s,cached(-0.0f).s));
}
'''
with tempfile.TemporaryDirectory() as td:
    src=pathlib.Path(td)/'test.cpp'; exe=pathlib.Path(td)/'test'; src.write_text(source)
    compiler=shutil.which('c++') or shutil.which('g++') or shutil.which('clang++')
    assert compiler, 'a C++ compiler is required for the pure host equivalence test'
    subprocess.run([compiler,'-std=c++11','-O2',str(src),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('PASS: cached trig pair is bit-exact for repeated and distinct angles, including signed zero/NaN')
