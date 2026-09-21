#include <array>
#include <cassert>
#include <cmath>
#include <cstdio>
#include "hbnf_vibe16.h"
static float c(float x,float a,float b){return x<a?a:(x>b?b:x);}
struct S{std::array<uint8_t,16> f{};float v=90;};
static S sig(int t,int hitBand,bool build=false){S s;float gain=build&&t>300?1.0f+0.00035f*(t-300):1.0f;for(int i=0;i<16;i++)s.f[i]=(uint8_t)c((i<4?70:(i<11?52:36))*gain,0,210);if((t>=1000&&t<1070)||(build&&t>=2200&&t<2280)){int a=hitBand==0?0:(hitBand==1?4:11),b=hitBand==0?4:(hitBand==1?11:16);for(int i=a;i<b;i++)s.f[i]=(uint8_t)c(s.f[i]+145,0,255);s.v=190;}return s;}
static std::array<float,7> run(int band,bool build=false){hbnf::Vibe16 v;std::array<float,7> mx{};for(int t=0;t<3000;t+=20){auto s=sig(t,band,build);auto m=v.update(s.f.data(),s.v,.020f);for(int p=0;p<6;p++)mx[p]=fmaxf(mx[p],v.profileFactor((hbnf::VibeProfile)p));mx[6]=fmaxf(mx[6],m.drop);}return mx;}
int main(){auto b=run(0),m=run(1),t=run(2),d=run(0,true);for(auto a:{b,m,t,d})for(int i=0;i<6;i++)assert(a[i]>=.099f&&a[i]<=3.851f);assert(b[hbnf::PROFILE_BASS]>b[hbnf::PROFILE_TREBLE]+0.45f);assert(m[hbnf::PROFILE_MID]>m[hbnf::PROFILE_BASS]+0.15f);assert(t[hbnf::PROFILE_TREBLE]>t[hbnf::PROFILE_BASS]+0.35f);assert(b[hbnf::PROFILE_FULL]>1.0f&&m[hbnf::PROFILE_FULL]>1.0f&&t[hbnf::PROFILE_FULL]>1.0f);assert(d[6]>0.70f);printf("PASS WOW MAX vibe profiles/drop; bass %.2f mid %.2f treble %.2f drop %.2f bytes=%zu\n",b[1],m[2],t[3],d[6],sizeof(hbnf::Vibe16));}
