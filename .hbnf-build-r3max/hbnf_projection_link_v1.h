#pragma once
#include <stdint.h>
#include <stddef.h>

namespace hbnf {

static const uint8_t PROJECTION_PIXELS=22;
static const uint16_t PROJECTION_PORT=11989;
static const uint16_t PROJECTION_DISCOVERY_PORT=11990;
static const size_t PROJECTION_PACKET_BYTES=77;
static const size_t PROJECTION_HELLO_BYTES=10;

inline uint16_t projectionCrc16(const uint8_t* data,size_t n){
  uint16_t crc=0xFFFFu;
  for(size_t i=0;i<n;i++){
    crc^=(uint16_t)data[i]<<8;
    for(uint8_t b=0;b<8;b++) crc=(crc&0x8000u)?(uint16_t)((crc<<1)^0x1021u):(uint16_t)(crc<<1);
  }
  return crc;
}

inline void projectionLiftLuma(uint8_t& r,uint8_t& g,uint8_t& b){
  const uint8_t peak=r>g?(r>b?r:b):(g>b?g:b);
  if(peak<4) return;
  uint16_t target=56u+((uint16_t)peak*199u+127u)/255u;
  if(target<peak) target=peak;
  if(target>255u) target=255u;
  r=(uint8_t)(((uint16_t)r*target+peak/2u)/peak);
  g=(uint8_t)(((uint16_t)g*target+peak/2u)/peak);
  b=(uint8_t)(((uint16_t)b*target+peak/2u)/peak);
}

class ProjectionAccumulator {
 public:
  ProjectionAccumulator(){ clear(); }
  void clear(){
    for(uint8_t i=0;i<PROJECTION_PIXELS;i++){rs_[i]=gs_[i]=bs_[i]=0;count_[i]=0;}
  }
  void add(uint16_t x,uint16_t y,uint16_t width,uint16_t height,uint8_t r,uint8_t g,uint8_t b){
    if(width<2 || height<2) return;

    // Map the Matrix perimeter onto the physical cart underglow chain:
    // short side 5 -> long side 6 -> short side 5 -> long side 6.
    // Use a 2-pixel perimeter band for visual stability without collapsing
    // the whole 2-D frame into horizontal averages.
    const uint16_t bandX = width >= 16 ? 2 : 1;
    const uint16_t bandY = height >= 8 ? 2 : 1;
    uint8_t bin=255;

    if(x < bandX) {
      bin=(uint8_t)(((uint32_t)y*5u)/height);               // 0..4
      if(bin>4) bin=4;
    } else if(y < bandY) {
      bin=(uint8_t)(5u + ((uint32_t)x*6u)/width);          // 5..10
      if(bin>10) bin=10;
    } else if(x >= width-bandX) {
      uint16_t ry=(uint16_t)(height-1u-y);
      bin=(uint8_t)(11u + ((uint32_t)ry*5u)/height);       // 11..15
      if(bin>15) bin=15;
    } else if(y >= height-bandY) {
      uint16_t rx=(uint16_t)(width-1u-x);
      bin=(uint8_t)(16u + ((uint32_t)rx*6u)/width);        // 16..21
      if(bin>21) bin=21;
    } else {
      return;
    }

    rs_[bin]+=r; gs_[bin]+=g; bs_[bin]+=b;
    if(count_[bin]<65535u) count_[bin]++;
  }
  bool finalize(uint8_t out[PROJECTION_PIXELS*3]) const{
    bool any=false;
    for(uint8_t i=0;i<PROJECTION_PIXELS;i++){
      const uint16_t n=count_[i];
      uint8_t r=0,g=0,b=0;
      if(n){ r=(uint8_t)(rs_[i]/n); g=(uint8_t)(gs_[i]/n); b=(uint8_t)(bs_[i]/n); any=true; }
      out[i*3]=r; out[i*3+1]=g; out[i*3+2]=b;
    }
    return any;
  }
 private:
  uint32_t rs_[PROJECTION_PIXELS],gs_[PROJECTION_PIXELS],bs_[PROJECTION_PIXELS];
  uint16_t count_[PROJECTION_PIXELS];
};

inline size_t encodeProjectionHello(uint32_t nonce,uint8_t out[PROJECTION_HELLO_BYTES]){
  out[0]='H';out[1]='B';out[2]='N';out[3]='A';
  out[4]=1;
  out[5]=(uint8_t)(nonce>>24); out[6]=(uint8_t)(nonce>>16);
  out[7]=(uint8_t)(nonce>>8); out[8]=(uint8_t)nonce;
  out[9]=0xA5;
  return PROJECTION_HELLO_BYTES;
}

inline bool decodeProjectionHello(const uint8_t* in,size_t n,uint32_t& nonce){
  if(!in||n!=PROJECTION_HELLO_BYTES) return false;
  if(in[0]!='H'||in[1]!='B'||in[2]!='N'||in[3]!='A'||in[4]!=1||in[9]!=0xA5) return false;
  nonce=((uint32_t)in[5]<<24)|((uint32_t)in[6]<<16)|((uint32_t)in[7]<<8)|in[8];
  return true;
}

inline size_t encodeProjectionPacket(uint16_t seq,const uint8_t rgb[PROJECTION_PIXELS*3],uint8_t out[PROJECTION_PACKET_BYTES]){
  out[0]='H';out[1]='B';out[2]='N';out[3]='P';
  out[4]=1;
  out[5]=(uint8_t)(seq>>8); out[6]=(uint8_t)(seq&255u);
  out[7]=PROJECTION_PIXELS;
  out[8]=0;
  for(size_t i=0;i<PROJECTION_PIXELS*3;i++) out[9+i]=rgb[i];
  const uint16_t crc=projectionCrc16(out,PROJECTION_PACKET_BYTES-2);
  out[PROJECTION_PACKET_BYTES-2]=(uint8_t)(crc>>8);
  out[PROJECTION_PACKET_BYTES-1]=(uint8_t)(crc&255u);
  return PROJECTION_PACKET_BYTES;
}

inline bool decodeProjectionPacket(const uint8_t* in,size_t n,uint16_t& seq,uint8_t rgb[PROJECTION_PIXELS*3]){
  if(!in||n!=PROJECTION_PACKET_BYTES) return false;
  if(in[0]!='H'||in[1]!='B'||in[2]!='N'||in[3]!='P'||in[4]!=1||in[7]!=PROJECTION_PIXELS) return false;
  const uint16_t got=(uint16_t)((in[n-2]<<8)|in[n-1]);
  if(got!=projectionCrc16(in,n-2)) return false;
  seq=(uint16_t)((in[5]<<8)|in[6]);
  for(size_t i=0;i<PROJECTION_PIXELS*3;i++) rgb[i]=in[9+i];
  return true;
}

} // namespace hbnf
