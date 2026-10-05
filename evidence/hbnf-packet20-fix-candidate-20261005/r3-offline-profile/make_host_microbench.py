from pathlib import Path
import re
root=Path(__file__).resolve().parents[3]
h=(root/'evidence/hbnf-packet20-fresh-20261005/source-bound-package/ANIMartRIX.patched.h').read_text()
def fn(start):
 m=re.search(start,h)
 if not m: raise ValueError(start)
 brace=h.index('{',m.start()); i=brace+1; d=1; state='code'; esc=False
 while i<len(h):
  c=h[i]; n=h[i+1] if i+1<len(h) else ''
  if state=='line':
   if c=='\n': state='code'
  elif state=='block':
   if c=='*' and n=='/': state='code'; i+=1
  elif state in ('str','char'):
   if esc: esc=False
   elif c=='\\': esc=True
   elif (state=='str' and c=='"') or (state=='char' and c=="'"): state='code'
  elif c=='/' and n=='/': state='line'; i+=1
  elif c=='/' and n=='*': state='block'; i+=1
  elif c=='"': state='str'
  elif c=="'": state='char'
  elif c=='{': d+=1
  elif c=='}':
   d-=1
   if d==0:return h[m.start():i+1]
  i+=1
 raise ValueError('unbalanced '+start)
array=re.search(r'(?ms)^static const byte pNoise\[\] = \{.*?^\};',h).group(0)
helpers='\n'.join(fn(x) for x in [r'(?m)^static float fade\(',r'(?m)^static float lerp\(',r'(?m)^static float grad\(',r'(?m)^static float pnoise\('])
noise=fn(r'(?m)^static float pnoise\(')
# Reuse exact z lattice coordinate/fade values across render calls with identical z bits.
cache_setup='''
struct ZEntry { uint32_t bits=0; int Z=0; float frac=0; float w=0; bool valid=false; };
static ZEntry zcache[16];
static const ZEntry& getZContext(float z) {
  uint32_t bits; std::memcpy(&bits,&z,sizeof(bits));
  unsigned slot=(bits^(bits>>16)^(bits>>8)) & 15u;
  auto &e=zcache[slot];
  if(e.valid && e.bits==bits) return e;
  float base=floorf(z); e.bits=bits; e.Z=((int)base)&255; e.frac=z-base; e.w=fade(e.frac); e.valid=true;
  return e;
}
'''
fast=noise.replace('static float pnoise(', 'static float pnoise_cached_z(',1)
start=fast.index('int   X =')
end=fast.index('w = fade(z);',start)+len('w = fade(z);')
new="""int   X = (int)floorf(x) & 255,             /* FIND UNIT CUBE THAT */
      Y = (int)floorf(y) & 255;
const ZEntry &zc = getZContext(z);
int Z = zc.Z;
x -= floorf(x);
y -= floorf(y);
z = zc.frac;
float  u = fade(x),
       v = fade(y),
       w = zc.w;"""
fast=fast[:start]+new+fast[end:]
# Branch to the exact lower z plane when fade(z)==0, avoiding the unused upper plane.
integer_noise=noise.replace('static float pnoise(', 'static float pnoise_integer_plane(',1)
needle='return lerp(w,lerp(v,lerp(u, grad(P(AA  ), x, y, z),'
branch="""if (w == 0.0f) {
  float lower = lerp(v, lerp(u, grad(P(AA), x, y, z), grad(P(BA), x-1, y, z)),
                      lerp(u, grad(P(AB), x, y-1, z), grad(P(BB), x-1, y-1, z)));
  return lerp(w, lower, lower);
}
"""
assert needle in integer_noise
integer_noise=integer_noise.replace(needle,branch+needle,1)
rval=fn(r'(?m)^static float render_value\(')
rval0=rval.replace('static float render_value(', 'static float render_value_base(',1)
rval1=rval.replace('static float render_value(', 'static float render_value_cached_z(',1).replace('pnoise(newx, newy, newz)','pnoise_cached_z(newx, newy, newz)')
rval2=rval.replace('static float render_value(', 'static float render_value_integer_plane(',1).replace('pnoise(newx, newy, newz)','pnoise_integer_plane(newx, newy, newz)')
struct=fn(r'(?m)^struct render_parameters\s*')+';'
mapf=fn(r'(?m)^static float map_float\(')
code='''#include <cmath>\n#include <cstdint>\n#include <cstring>\n#include <chrono>\n#include <cstdio>\n#include <vector>
#include <algorithm>\nusing byte=uint8_t;\n'''+struct+'\n'+array+'\n#define P(x) pNoise[(x) & 255]\n'+helpers+'\n'+cache_setup+'\n'+fast+'\n'+integer_noise+'\n'+mapf+'\n'+rval0+'\n'+rval1+'\n'+rval2+'''\nstruct Input { render_parameters p; };
int main(){
  const float zs[]={50.0f,50.0f,25.0f,55.0f,2000.0f,55.0f};
  std::vector<Input> a; a.reserve(512*6);
  for(int pix=0;pix<512;pix++) for(int layer=0;layer<6;layer++){
    render_parameters p{}; p.center_x=15.5f; p.center_y=7.5f;
    p.offset_x=float((pix%32)-16)*0.19f; p.offset_y=float((pix/32)-8)*0.17f;
    p.offset_z=0.0f; p.z=zs[layer]; p.scale_x=0.09f; p.scale_y=0.08f; p.scale_z=0.1f;
    p.dist=1.0f+float(pix%41)*0.31f; p.angle=float((pix*17+layer*29)%6283)*0.001f;
    p.low_limit=-1.0f; p.high_limit=1.0f; a.push_back({p});
  }
  for(size_t i=0;i<a.size();i++) {
    float x=render_value_base(a[i].p), y=render_value_cached_z(a[i].p); uint32_t xb,yb;
    std::memcpy(&xb,&x,4); std::memcpy(&yb,&y,4); uint32_t zb;
    float z=render_value_integer_plane(a[i].p); std::memcpy(&zb,&z,4);
    float px=a[i].p.offset_x+a[i].p.angle, py=a[i].p.offset_y+a[i].p.dist;
    float pz=(a[i].p.offset_z+a[i].p.z)*a[i].p.scale_z;
    float p0=pnoise(px,py,pz), p1=pnoise_cached_z(px,py,pz), p2=pnoise_integer_plane(px,py,pz);
    uint32_t pb0,pb1,pb2; std::memcpy(&pb0,&p0,4); std::memcpy(&pb1,&p1,4); std::memcpy(&pb2,&p2,4);
    if(xb!=yb||xb!=zb||pb0!=pb1||pb0!=pb2){std::printf("MISMATCH %zu %08x %08x %08x / %08x %08x %08x\\n",i,xb,yb,zb,pb0,pb1,pb2); return 2;}
  }
  const int rounds=100; const double n=(double)a.size()*rounds;
  volatile float keep=0;
  auto measure_pnoise=[&](int which){ float sum=0; auto t0=std::chrono::steady_clock::now();
    if(which==0) for(int r=0;r<rounds;r++) for(auto &q:a) sum+=pnoise(q.p.offset_x+q.p.angle,q.p.offset_y+q.p.dist,(q.p.offset_z+q.p.z)*q.p.scale_z);
    else if(which==1) for(int r=0;r<rounds;r++) for(auto &q:a) sum+=pnoise_cached_z(q.p.offset_x+q.p.angle,q.p.offset_y+q.p.dist,(q.p.offset_z+q.p.z)*q.p.scale_z);
    else for(int r=0;r<rounds;r++) for(auto &q:a) sum+=pnoise_integer_plane(q.p.offset_x+q.p.angle,q.p.offset_y+q.p.dist,(q.p.offset_z+q.p.z)*q.p.scale_z);
    auto t1=std::chrono::steady_clock::now(); keep=sum; return std::chrono::duration<double,std::nano>(t1-t0).count()/n; };
  auto measure_render=[&](int which){ float sum=0; auto t0=std::chrono::steady_clock::now();
    if(which==0) for(int r=0;r<rounds;r++) for(auto &q:a) sum+=render_value_base(q.p);
    else if(which==1) for(int r=0;r<rounds;r++) for(auto &q:a) sum+=render_value_cached_z(q.p);
    else for(int r=0;r<rounds;r++) for(auto &q:a) sum+=render_value_integer_plane(q.p);
    auto t1=std::chrono::steady_clock::now(); keep=sum; return std::chrono::duration<double,std::nano>(t1-t0).count()/n; };
  double pn[3][9],rv[3][9];
  for(int t=0;t<9;t++) for(int off=0;off<3;off++) { int k=(t+off)%3; pn[k][t]=measure_pnoise(k); rv[k][t]=measure_render(k); }
  auto med=[](double x[9]) { std::sort(x,x+9); return x[4]; };
  std::printf("bitwise_equal=%zu inputs; median of 9 order-balanced host batches; calls_per_batch=%.0f\\n",a.size(),n);
  std::printf("host_pnoise_base_median_ns_per_call=%.2f\\n",med(pn[0]));
  std::printf("host_pnoise_zcache_median_ns_per_call=%.2f\\n",med(pn[1]));
  std::printf("host_pnoise_integer_plane_median_ns_per_call=%.2f\\n",med(pn[2]));
  std::printf("host_render_value_base_median_ns_per_call=%.2f\\n",med(rv[0]));
  std::printf("host_render_value_zcache_median_ns_per_call=%.2f\\n",med(rv[1]));
  std::printf("host_render_value_integer_plane_median_ns_per_call=%.2f\\n",med(rv[2]));
  std::printf("sink=%f\\n",(float)keep);
}
'''
out=Path(__file__).with_name('render_value_zcache_microbench.cpp')
out.write_text(code)
print(out)
