#include <cmath>
#include <cstdint>
#include <cstring>
#include <chrono>
#include <cstdio>
#include <vector>
#include <algorithm>
using byte=uint8_t;
struct render_parameters {
  float center_x;   // center of the matrix
  float center_y;
  float dist, angle;                
  float scale_x;    // smaller values = zoom in
  float scale_y;
  float scale_z;       
  float offset_x, offset_y, offset_z;     
  float z;  
  float low_limit;  // getting contrast by highering the black point
  float high_limit;                                            
};
static const byte pNoise[] = {   151,160,137,91,90, 15,131, 13,201,95,96,
53,194,233, 7,225,140,36,103,30,69,142, 8,99,37,240,21,10,23,190, 6,
148,247,120,234,75, 0,26,197,62,94,252,219,203,117, 35,11,32,57,177,
33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,
48,27,166, 77,146,158,231,83,111,229,122, 60,211,133,230,220,105,92,
41,55,46,245,40,244,102,143,54,65,25,63,161, 1,216,80,73,209,76,132,
187,208, 89, 18,169,200,196,135,130,116,188,159, 86,164,100,109,198,
173,186, 3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,
212,207,206, 59,227, 47,16,58,17,182,189, 28,42,223,183,170,213,119,
248,152,2,44,154,163,70,221,153,101,155,167,43,172, 9,129,22,39,253,
19,98,108,110,79,113,224,232,178,185,112,104,218,246, 97,228,251,34,
242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,
49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,
150,254,138,236,205, 93,222,114, 67,29,24, 72,243,141,128,195,78,66,
215,61,156,180
};
#define P(x) pNoise[(x) & 255]
static float fade(float t){ return t * t * t * (t * (t * 6 - 15) + 10); }
static float lerp(float t, float a, float b){ return a + t * (b - a); }
static float grad(int hash, float x, float y, float z)
{
int    h = hash & 15;          /* CONVERT LO 4 BITS OF HASH CODE */
float  u = h < 8 ? x : y,      /* INTO 12 GRADIENT DIRECTIONS.   */
          v = h < 4 ? y : h==12||h==14 ? x : z;
return ((h&1) == 0 ? u : -u) + ((h&2) == 0 ? v : -v);
}
static float pnoise(float x, float y, float z) {
  
int   X = (int)floorf(x) & 255,             /* FIND UNIT CUBE THAT */
      Y = (int)floorf(y) & 255,             /* CONTAINS POINT.     */
      Z = (int)floorf(z) & 255;
x -= floorf(x);                             /* FIND RELATIVE X,Y,Z */
y -= floorf(y);                             /* OF POINT IN CUBE.   */
z -= floorf(z);
float  u = fade(x),                         /* COMPUTE FADE CURVES */
       v = fade(y),                         /* FOR EACH OF X,Y,Z.  */
       w = fade(z);
int  A = P(X)+Y, 
     AA = P(A)+Z, 
     AB = P(A+1)+Z,                         /* HASH COORDINATES OF */
     B = P(X+1)+Y, 
     BA = P(B)+Z, 
     BB = P(B+1)+Z;                         /* THE 8 CUBE CORNERS, */

return lerp(w,lerp(v,lerp(u, grad(P(AA  ), x, y, z),    /* AND ADD */
                          grad(P(BA  ), x-1, y, z)),    /* BLENDED */
              lerp(u, grad(P(AB  ), x, y-1, z),         /* RESULTS */
                   grad(P(BB  ), x-1, y-1, z))),        /* FROM  8 */
            lerp(v, lerp(u, grad(P(AA+1), x, y, z-1),   /* CORNERS */
                 grad(P(BA+1), x-1, y, z-1)),           /* OF CUBE */
              lerp(u, grad(P(AB+1), x, y-1, z-1),
                   grad(P(BB+1), x-1, y-1, z-1))));
}

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

static float pnoise_cached_z(float x, float y, float z) {
  
int   X = (int)floorf(x) & 255,             /* FIND UNIT CUBE THAT */
      Y = (int)floorf(y) & 255;
const ZEntry &zc = getZContext(z);
int Z = zc.Z;
x -= floorf(x);
y -= floorf(y);
z = zc.frac;
float  u = fade(x),
       v = fade(y),
       w = zc.w;
int  A = P(X)+Y, 
     AA = P(A)+Z, 
     AB = P(A+1)+Z,                         /* HASH COORDINATES OF */
     B = P(X+1)+Y, 
     BA = P(B)+Z, 
     BB = P(B+1)+Z;                         /* THE 8 CUBE CORNERS, */

return lerp(w,lerp(v,lerp(u, grad(P(AA  ), x, y, z),    /* AND ADD */
                          grad(P(BA  ), x-1, y, z)),    /* BLENDED */
              lerp(u, grad(P(AB  ), x, y-1, z),         /* RESULTS */
                   grad(P(BB  ), x-1, y-1, z))),        /* FROM  8 */
            lerp(v, lerp(u, grad(P(AA+1), x, y, z-1),   /* CORNERS */
                 grad(P(BA+1), x-1, y, z-1)),           /* OF CUBE */
              lerp(u, grad(P(AB+1), x, y-1, z-1),
                   grad(P(BB+1), x-1, y-1, z-1))));
}
static float pnoise_integer_plane(float x, float y, float z) {
  
int   X = (int)floorf(x) & 255,             /* FIND UNIT CUBE THAT */
      Y = (int)floorf(y) & 255,             /* CONTAINS POINT.     */
      Z = (int)floorf(z) & 255;
x -= floorf(x);                             /* FIND RELATIVE X,Y,Z */
y -= floorf(y);                             /* OF POINT IN CUBE.   */
z -= floorf(z);
float  u = fade(x),                         /* COMPUTE FADE CURVES */
       v = fade(y),                         /* FOR EACH OF X,Y,Z.  */
       w = fade(z);
int  A = P(X)+Y, 
     AA = P(A)+Z, 
     AB = P(A+1)+Z,                         /* HASH COORDINATES OF */
     B = P(X+1)+Y, 
     BA = P(B)+Z, 
     BB = P(B+1)+Z;                         /* THE 8 CUBE CORNERS, */

if (w == 0.0f) {
  float lower = lerp(v, lerp(u, grad(P(AA), x, y, z), grad(P(BA), x-1, y, z)),
                      lerp(u, grad(P(AB), x, y-1, z), grad(P(BB), x-1, y-1, z)));
  return lerp(w, lower, lower);
}
return lerp(w,lerp(v,lerp(u, grad(P(AA  ), x, y, z),    /* AND ADD */
                          grad(P(BA  ), x-1, y, z)),    /* BLENDED */
              lerp(u, grad(P(AB  ), x, y-1, z),         /* RESULTS */
                   grad(P(BB  ), x-1, y-1, z))),        /* FROM  8 */
            lerp(v, lerp(u, grad(P(AA+1), x, y, z-1),   /* CORNERS */
                 grad(P(BA+1), x-1, y, z-1)),           /* OF CUBE */
              lerp(u, grad(P(AB+1), x, y-1, z-1),
                   grad(P(BB+1), x-1, y-1, z-1))));
}
static float map_float(float x, float in_min, float in_max, float out_min, float out_max) {
  
  float result = (x-in_min) * (out_max-out_min) / (in_max-in_min) + out_min;
  if (result < out_min) result = out_min;
  if( result > out_max) result = out_max;

  return result; 
}
static float render_value_base(const render_parameters &animation) {

  // convert polar coordinates back to cartesian ones

  float newx = (animation.offset_x + animation.center_x - (cosf(animation.angle) * animation.dist)) * animation.scale_x;
  float newy = (animation.offset_y + animation.center_y - (sinf(animation.angle) * animation.dist)) * animation.scale_y;
  float newz = (animation.offset_z + animation.z) * animation.scale_z;

  // render noisevalue at this new cartesian point

  float raw_noise_field_value = pnoise(newx, newy, newz);
  
  // A) enhance histogram (improve contrast) by setting the black and white point (low & high_limit)
  // B) scale the result to a 0-255 range (assuming you want 8 bit color depth per rgb chanel)
  // Here happens the contrast boosting & the brightness mapping

  if (raw_noise_field_value < animation.low_limit)  raw_noise_field_value =  animation.low_limit;
  if (raw_noise_field_value > animation.high_limit) raw_noise_field_value = animation.high_limit;

  float scaled_noise_value = map_float(raw_noise_field_value, animation.low_limit, animation.high_limit, 0, 255);

  return scaled_noise_value;
}
static float render_value_cached_z(const render_parameters &animation) {

  // convert polar coordinates back to cartesian ones

  float newx = (animation.offset_x + animation.center_x - (cosf(animation.angle) * animation.dist)) * animation.scale_x;
  float newy = (animation.offset_y + animation.center_y - (sinf(animation.angle) * animation.dist)) * animation.scale_y;
  float newz = (animation.offset_z + animation.z) * animation.scale_z;

  // render noisevalue at this new cartesian point

  float raw_noise_field_value = pnoise_cached_z(newx, newy, newz);
  
  // A) enhance histogram (improve contrast) by setting the black and white point (low & high_limit)
  // B) scale the result to a 0-255 range (assuming you want 8 bit color depth per rgb chanel)
  // Here happens the contrast boosting & the brightness mapping

  if (raw_noise_field_value < animation.low_limit)  raw_noise_field_value =  animation.low_limit;
  if (raw_noise_field_value > animation.high_limit) raw_noise_field_value = animation.high_limit;

  float scaled_noise_value = map_float(raw_noise_field_value, animation.low_limit, animation.high_limit, 0, 255);

  return scaled_noise_value;
}
static float render_value_integer_plane(const render_parameters &animation) {

  // convert polar coordinates back to cartesian ones

  float newx = (animation.offset_x + animation.center_x - (cosf(animation.angle) * animation.dist)) * animation.scale_x;
  float newy = (animation.offset_y + animation.center_y - (sinf(animation.angle) * animation.dist)) * animation.scale_y;
  float newz = (animation.offset_z + animation.z) * animation.scale_z;

  // render noisevalue at this new cartesian point

  float raw_noise_field_value = pnoise_integer_plane(newx, newy, newz);
  
  // A) enhance histogram (improve contrast) by setting the black and white point (low & high_limit)
  // B) scale the result to a 0-255 range (assuming you want 8 bit color depth per rgb chanel)
  // Here happens the contrast boosting & the brightness mapping

  if (raw_noise_field_value < animation.low_limit)  raw_noise_field_value =  animation.low_limit;
  if (raw_noise_field_value > animation.high_limit) raw_noise_field_value = animation.high_limit;

  float scaled_noise_value = map_float(raw_noise_field_value, animation.low_limit, animation.high_limit, 0, 255);

  return scaled_noise_value;
}
struct Input { render_parameters p; };
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
    if(xb!=yb||xb!=zb||pb0!=pb1||pb0!=pb2){std::printf("MISMATCH %zu %08x %08x %08x / %08x %08x %08x\n",i,xb,yb,zb,pb0,pb1,pb2); return 2;}
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
  std::printf("bitwise_equal=%zu inputs; median of 9 order-balanced host batches; calls_per_batch=%.0f\n",a.size(),n);
  std::printf("host_pnoise_base_median_ns_per_call=%.2f\n",med(pn[0]));
  std::printf("host_pnoise_zcache_median_ns_per_call=%.2f\n",med(pn[1]));
  std::printf("host_pnoise_integer_plane_median_ns_per_call=%.2f\n",med(pn[2]));
  std::printf("host_render_value_base_median_ns_per_call=%.2f\n",med(rv[0]));
  std::printf("host_render_value_zcache_median_ns_per_call=%.2f\n",med(rv[1]));
  std::printf("host_render_value_integer_plane_median_ns_per_call=%.2f\n",med(rv[2]));
  std::printf("sink=%f\n",(float)keep);
}
