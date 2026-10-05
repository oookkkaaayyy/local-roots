#include <cstdint>
#include <cmath>
#include <cstring>
#include <vector>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
using byte=uint8_t;
#ifndef PI
#define PI 3.14159265358979323846
#endif
static uint32_t g_millis=0; static uint32_t g_micros=0;
uint32_t millis(){return g_millis;} uint32_t micros(){g_micros+=10;return g_micros;}
struct CHSV { float h; uint8_t s,v; CHSV(float H,uint8_t S,uint8_t V):h(H),s(S),v(V){} };
struct CRGB { uint8_t red=0,green=0,blue=0; CRGB()=default; CRGB(float r,float g,float b):red((uint8_t)r),green((uint8_t)g),blue((uint8_t)b){} CRGB(CHSV c){ float h=std::fmod(c.h,256.f)/43.f; int i=(int)h; float f=h-i; float v=c.v/255.f,s=c.s/255.f; float p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f)); float r,g,b; switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;default:r=v;g=p;b=q;} red=(uint8_t)(r*255);green=(uint8_t)(g*255);blue=(uint8_t)(b*255);}};
struct SerialStub { template<class T> void print(T){} template<class T> void println(T){} }; SerialStub Serial;
#ifdef HBNF_R4
#include "ANIMartRIX_R4_host.h"
#else
#include "ANIMartRIX_R1_host.h"
#endif
struct TestRenderer:ANIMartRIX { std::vector<CRGB> px; TestRenderer():ANIMartRIX(32,16,false),px(512){} void setPixelColor(int x,int y,rgb p) override {px[y*32+x]=CRGB(p.red,p.green,p.blue);} void setPixelColor(int i,rgb p) override {px[i]=CRGB(p.red,p.green,p.blue);} };
struct Entry { const char* name; void (ANIMartRIX::*fn)(); };
static const Entry es[]={
{"Complex_Kaleido_3",&ANIMartRIX::Complex_Kaleido_3},{"Big_Caleido",&ANIMartRIX::Big_Caleido},{"Parametric_Water",&ANIMartRIX::Parametric_Water},{"RGB_Blobs5",&ANIMartRIX::RGB_Blobs5},{"Polar_Waves",&ANIMartRIX::Polar_Waves},{"Zoom2",&ANIMartRIX::Zoom2},{"Complex_Kaleido_4",&ANIMartRIX::Complex_Kaleido_4},{"Complex_Kaleido_6",&ANIMartRIX::Complex_Kaleido_6},{"Water",&ANIMartRIX::Water},{"RGB_Blobs4",&ANIMartRIX::RGB_Blobs4},{"Complex_Kaleido_5",&ANIMartRIX::Complex_Kaleido_5},{"Spiralus2",&ANIMartRIX::Spiralus2},{"Hot_Blob",&ANIMartRIX::Hot_Blob},{"Caleido3",&ANIMartRIX::Caleido3},{"Waves",&ANIMartRIX::Waves},{"Chasing_Spirals",&ANIMartRIX::Chasing_Spirals},{"Rotating_Blob",&ANIMartRIX::Rotating_Blob},{"Center_Field",&ANIMartRIX::Center_Field},{"Distance_Experiment",&ANIMartRIX::Distance_Experiment},{"Lava1",&ANIMartRIX::Lava1},{"Caleido2",&ANIMartRIX::Caleido2},{"Yves",&ANIMartRIX::Yves},{"Scaledemo1",&ANIMartRIX::Scaledemo1},{"Zoom",&ANIMartRIX::Zoom},{"Complex_Kaleido",&ANIMartRIX::Complex_Kaleido},{"RGB_Blobs3",&ANIMartRIX::RGB_Blobs3},{"SM5",&ANIMartRIX::SM5},{"Module_Experiment10",&ANIMartRIX::Module_Experiment10}};
struct Case{uint32_t ms;float speed;}; static const Case cases[]={{1000,1.f},{5000,1.f},{15000,.75f},{45000,1.25f}};
static void stats(const char *name,Case c,const std::vector<CRGB>& a,const std::vector<CRGB>& b){std::vector<int> errs;errs.reserve(1536);int exact=0,mx=0;long long sum=0;for(int i=0;i<512;i++){int d[3]={abs((int)a[i].red-b[i].red),abs((int)a[i].green-b[i].green),abs((int)a[i].blue-b[i].blue)};if(!d[0]&&!d[1]&&!d[2])exact++;for(int v:d){errs.push_back(v);sum+=v;if(v>mx)mx=v;}}std::sort(errs.begin(),errs.end());int p95=errs[(errs.size()*95+99)/100-1];std::printf("%s,%u,%.2f,%.6f,%.4f,%d,%d\n",name,c.ms,c.speed,100.0*exact/512.0,(double)sum/1536.0,p95,mx);}
int main(){std::puts("kernel,timestamp_ms,speed,exact_pixel_pct,mean_channel_abs_error,p95_channel_abs_error,max_channel_abs_error");for(const auto &e:es)for(auto c:cases){TestRenderer r1,r4; r1.speed_factor=c.speed;r4.speed_factor=c.speed;g_millis=c.ms;g_micros=0;(r1.*e.fn)();g_millis=c.ms;g_micros=0;(r4.*e.fn)();stats(e.name,c,r1.px,r4.px);}}
