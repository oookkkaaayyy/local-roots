#include <cassert>
#include <cstdint>
#include <cstdio>
#include <random>
#include "game_core.h"

using namespace hbnf_game;

static PadState randomPad(std::mt19937& r) {
  PadState p;
  p.connected = true;
  const uint32_t x = r();
  p.up = (x & 1u) != 0;
  p.down = (x & 2u) != 0;
  p.left = (x & 4u) != 0;
  p.right = (x & 8u) != 0;
  p.a = (x & 0x10u) != 0 && (r() % 17u == 0);
  p.b = (x & 0x20u) != 0 && (r() % 23u == 0);
  p.start = (x & 0x40u) != 0 && (r() % 43u == 0);
  p.select = (x & 0x80u) != 0 && (r() % 43u == 0);
  return p;
}

static void framebufferGate() {
  Framebuffer f;
  f.clear();
  for (int y = 0; y < kHeight; ++y) for (int x = 0; x < kWidth; ++x) f.set(x,y,RGB(1,2,3));
  assert(f.rejectedWrites == 0);
  f.set(-1,0,1); f.set(kWidth,0,1); f.set(0,-1,1); f.set(0,kHeight,1);
  assert(f.rejectedWrites == 4);
}

static void snakeGate() {
  SnakeGame s;
  PadState none;
  for (int i=0;i<5;++i) s.update(none,125);
  assert(s.alive());
  assert(s.head().x > 15);

  SnakeGame wall;
  for (int i=0;i<40 && wall.alive();++i) wall.update(none,125);
  assert(!wall.alive());
  PadState restart; restart.a=true;
  wall.update(restart,16);
  assert(wall.alive());
  assert(wall.length()==4);

  Framebuffer f;
  std::mt19937 r(0x51514E);
  for (int i=0;i<100000;++i) {
    auto p=randomPad(r);
    if (!s.alive()) { p.a=true; }
    s.update(p, 1u + (r()%80u));
    s.render(f);
    assert(f.rejectedWrites==0);
    assert(s.length()>=4 && s.length()<=kPixels);
  }
}

static void pongGate() {
  PongGame p;
  Framebuffer f;
  std::mt19937 r(0x504F4E47);
  uint32_t lastTotal=0;
  for (int i=0;i<180000;++i) {
    auto a=randomPad(r), b=randomPad(r);
    p.update(a,b,1u+(r()%50u));
    p.render(f);
    assert(f.rejectedWrites==0);
    assert(p.ballY() > -2.1f && p.ballY() < float(kHeight)+2.1f);
    const uint32_t total=p.score1()+p.score2();
    assert(total>=lastTotal);
    lastTotal=total;
  }
  assert(lastTotal>0);
}

static uint64_t scriptedChecksum() {
  GameManager g;
  Framebuffer f;
  PadState p1,p2;
  p1.connected=p2.connected=true;

  // Choose Snake.
  p1.a=true; g.update(p1,p2,16); p1.a=false;
  for (int i=0;i<75;++i) {
    if (i==10) p1.down=true;
    if (i==11) p1.down=false;
    if (i==25) p1.left=true;
    if (i==26) p1.left=false;
    if (i==40) p1.up=true;
    if (i==41) p1.up=false;
    g.update(p1,p2,33);
  }
  g.render(f);
  assert(f.rejectedWrites==0);
  return f.checksum();
}

static void managerFuzzGate() {
  GameManager g;
  Framebuffer f;
  std::mt19937 r(0xA11CE55u);
  for (int i=0;i<250000;++i) {
    auto p1=randomPad(r), p2=randomPad(r);
    if ((r()%5000u)==0) { p1.start=true; p1.select=true; }
    g.update(p1,p2,1u+(r()%100u));
    g.render(f);
    assert(f.rejectedWrites==0);
    assert(int(g.mode())>=int(GameManager::Mode::Menu));
    assert(int(g.mode())<=int(GameManager::Mode::Pong));
  }
}

static void exitHoldGate() {
  GameManager g;
  Framebuffer f;
  PadState p1,p2;
  p1.a=true; g.update(p1,p2,16); p1.a=false;
  assert(g.mode()==GameManager::Mode::Snake);
  p1.start=true; p1.select=true;
  for (int i=0;i<7;++i) g.update(p1,p2,100);
  assert(g.mode()==GameManager::Mode::Snake);
  g.update(p1,p2,100);
  assert(g.mode()==GameManager::Mode::Menu);
  g.render(f);
  assert(f.rejectedWrites==0);
}

int main() {
  framebufferGate();
  snakeGate();
  pongGate();
  exitHoldGate();
  managerFuzzGate();
  const uint64_t a=scriptedChecksum();
  const uint64_t b=scriptedChecksum();
  assert(a==b);
  std::printf("PASS: HBNF game core host gates; deterministic checksum=%llu\n",
              static_cast<unsigned long long>(a));
}
