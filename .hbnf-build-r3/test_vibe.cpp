#include <array>
#include <cassert>
#include <cmath>
#include <cstdio>
#include "hbnf_vibe16.h"
static float c(float x,float a,float b){return x<a?a:(x>b?b:x);}
struct S{std::array<uint8_t,16> f{};float v=90;};
static S sig(int t,int hitBand){S s;for(int i=0;i<16;i++)s.f[i]=(i<4?70:(i<11?52:36));if(t>=1000&&t<1070){int a=hitBand==0?0:(hitBand==1?4:11),b=hitBand==0?4:(hitBand==1?11:16);for(int i=a;i<b;i++)s.f[i]=(uint8_t)c(s.f[i]+145,0,255);s.v=170;}return s;}
static std::array<float,6> run(int band){hbnf::Vibe16 v;std::array<float,6> mx{};for(int t=0;t<1800;t+=20){auto s=sig(t,band);v.update(s.f.data(),s.v,.020f);for(int p=0;p<6;p++)mx[p]=fmaxf(mx[p],v.profileFactor((hbnf::VibeProfile)p));}return mx;}
int main(){auto b=run(0),m=run(1),t=run(2);for(auto a:{b,m,t})for(float x:a)assert(x>=.099f&&x<=3.851f);assert(b[hbnf::PROFILE_BASS]>b[hbnf::PROFILE_TREBLE]+0.55f);assert(m[hbnf::PROFILE_MID]>m[hbnf::PROFILE_BASS]+0.20f);assert(t[hbnf::PROFILE_TREBLE]>t[hbnf::PROFILE_BASS]+0.40f);assert(b[hbnf::PROFILE_FULL]>1.0f&&m[hbnf::PROFILE_FULL]>1.0f&&t[hbnf::PROFILE_FULL]>1.0f);printf("PASS R3 vibe profiles; bass %.2f mid %.2f treble %.2f full %.2f impact %.2f bytes=%zu\n",b[1],m[2],t[3],b[4],b[5],sizeof(hbnf::Vibe16));}
