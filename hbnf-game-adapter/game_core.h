#pragma once

#include <array>
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace hbnf_game {

constexpr int kWidth = 32;
constexpr int kHeight = 16;
constexpr int kPixels = kWidth * kHeight;

constexpr uint32_t RGB(uint8_t r, uint8_t g, uint8_t b) {
  return (uint32_t(r) << 16) | (uint32_t(g) << 8) | uint32_t(b);
}

struct PadState {
  bool connected = false;
  bool up = false;
  bool down = false;
  bool left = false;
  bool right = false;
  bool a = false;
  bool b = false;
  bool start = false;
  bool select = false;
  int16_t lx = 0;
  int16_t ly = 0;
};

struct Framebuffer {
  std::array<uint32_t, kPixels> px{};
  uint32_t rejectedWrites = 0;

  void clear(uint32_t c = 0) { px.fill(c); }

  void set(int x, int y, uint32_t c) {
    if (x < 0 || x >= kWidth || y < 0 || y >= kHeight) {
      ++rejectedWrites;
      return;
    }
    px[size_t(y * kWidth + x)] = c;
  }

  uint32_t get(int x, int y) const {
    if (x < 0 || x >= kWidth || y < 0 || y >= kHeight) return 0;
    return px[size_t(y * kWidth + x)];
  }

  uint64_t checksum() const {
    uint64_t h = 1469598103934665603ULL;
    for (uint32_t v : px) {
      h ^= v;
      h *= 1099511628211ULL;
    }
    return h;
  }
};

struct Point {
  int8_t x = 0;
  int8_t y = 0;
  constexpr Point() = default;
  constexpr Point(int8_t xValue, int8_t yValue) : x(xValue), y(yValue) {}
  bool operator==(const Point& o) const { return x == o.x && y == o.y; }
};

class XorShift32 {
 public:
  explicit XorShift32(uint32_t seed = 0x48B34A21u) : s_(seed ? seed : 1u) {}
  uint32_t next() {
    uint32_t x = s_;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    s_ = x;
    return x;
  }
  int range(int n) { return n <= 1 ? 0 : int(next() % uint32_t(n)); }
 private:
  uint32_t s_;
};

class SnakeGame {
 public:
  enum class Dir : uint8_t { Up, Down, Left, Right };

  void reset(uint32_t seed = 0x51A9E123u) {
    rng_ = XorShift32(seed);
    length_ = 4;
    body_[0] = {15, 8};
    body_[1] = {14, 8};
    body_[2] = {13, 8};
    body_[3] = {12, 8};
    dir_ = Dir::Right;
    queued_ = dir_;
    elapsedMs_ = 0;
    alive_ = true;
    score_ = 0;
    placeFood();
  }

  SnakeGame() { reset(); }

  void update(const PadState& p, uint32_t dtMs) {
    if (!alive_) {
      if (p.a) reset();
      return;
    }
    if (p.up && dir_ != Dir::Down) queued_ = Dir::Up;
    else if (p.down && dir_ != Dir::Up) queued_ = Dir::Down;
    else if (p.left && dir_ != Dir::Right) queued_ = Dir::Left;
    else if (p.right && dir_ != Dir::Left) queued_ = Dir::Right;

    elapsedMs_ += std::min<uint32_t>(dtMs, 100);
    const uint32_t stepMs = std::max<uint32_t>(58, 125 - std::min<uint32_t>(score_ * 3, 67));
    while (elapsedMs_ >= stepMs && alive_) {
      elapsedMs_ -= stepMs;
      step();
    }
  }

  void render(Framebuffer& fb) const {
    fb.clear(0);
    const uint32_t bodyColor = RGB(70, 220, 95);
    const uint32_t headColor = RGB(180, 255, 195);
    const uint32_t foodColor = RGB(255, 70, 70);
    for (uint16_t i = 0; i < length_; ++i) {
      fb.set(body_[i].x, body_[i].y, i == 0 ? headColor : bodyColor);
    }
    fb.set(food_.x, food_.y, foodColor);
    if (!alive_) {
      for (int x = 0; x < kWidth; ++x) {
        fb.set(x, 0, RGB(100, 0, 0));
        fb.set(x, kHeight - 1, RGB(100, 0, 0));
      }
    }
  }

  bool alive() const { return alive_; }
  uint16_t length() const { return length_; }
  uint16_t score() const { return score_; }
  Point head() const { return body_[0]; }
  Point food() const { return food_; }

 private:
  void step() {
    dir_ = queued_;
    Point h = body_[0];
    switch (dir_) {
      case Dir::Up: --h.y; break;
      case Dir::Down: ++h.y; break;
      case Dir::Left: --h.x; break;
      case Dir::Right: ++h.x; break;
    }

    if (h.x < 0 || h.x >= kWidth || h.y < 0 || h.y >= kHeight) {
      alive_ = false;
      return;
    }
    for (uint16_t i = 0; i < length_; ++i) {
      if (body_[i] == h) {
        alive_ = false;
        return;
      }
    }

    const bool ate = (h == food_);
    const uint16_t newLength = ate ? std::min<uint16_t>(uint16_t(length_ + 1), kPixels) : length_;
    for (uint16_t i = newLength - 1; i > 0; --i) {
      body_[i] = body_[i - 1];
    }
    body_[0] = h;
    length_ = newLength;

    if (ate) {
      ++score_;
      placeFood();
    }
  }

  void placeFood() {
    for (int attempt = 0; attempt < kPixels * 2; ++attempt) {
      Point p{int8_t(rng_.range(kWidth)), int8_t(rng_.range(kHeight))};
      bool occupied = false;
      for (uint16_t i = 0; i < length_; ++i) {
        if (body_[i] == p) { occupied = true; break; }
      }
      if (!occupied) { food_ = p; return; }
    }
    for (int y = 0; y < kHeight; ++y) {
      for (int x = 0; x < kWidth; ++x) {
        Point p{int8_t(x), int8_t(y)};
        bool occupied = false;
        for (uint16_t i = 0; i < length_; ++i) if (body_[i] == p) { occupied = true; break; }
        if (!occupied) { food_ = p; return; }
      }
    }
    food_ = body_[0];
  }

  std::array<Point, kPixels> body_{};
  uint16_t length_ = 0;
  Dir dir_ = Dir::Right;
  Dir queued_ = Dir::Right;
  Point food_{};
  uint32_t elapsedMs_ = 0;
  bool alive_ = true;
  uint16_t score_ = 0;
  XorShift32 rng_;
};

class PongGame {
 public:
  void reset() {
    p1y_ = p2y_ = 6.0f;
    score1_ = score2_ = 0;
    serveDir_ = 1;
    resetBall();
  }

  PongGame() { reset(); }

  void update(const PadState& p1, const PadState& p2, uint32_t dtMs) {
    const float dt = float(std::min<uint32_t>(dtMs, 50)) / 1000.0f;
    const float paddleSpeed = 14.0f;
    const float p1axis = (p1.down ? 1.0f : 0.0f) - (p1.up ? 1.0f : 0.0f);
    const float p2axis = (p2.down ? 1.0f : 0.0f) - (p2.up ? 1.0f : 0.0f);
    p1y_ = clamp(p1y_ + p1axis * paddleSpeed * dt, 0.0f, float(kHeight - kPaddle));
    p2y_ = clamp(p2y_ + p2axis * paddleSpeed * dt, 0.0f, float(kHeight - kPaddle));

    ballX_ += vx_ * dt;
    ballY_ += vy_ * dt;

    if (ballY_ < 0.0f) {
      ballY_ = -ballY_;
      vy_ = std::fabs(vy_);
    } else if (ballY_ > float(kHeight - 1)) {
      ballY_ = 2.0f * float(kHeight - 1) - ballY_;
      vy_ = -std::fabs(vy_);
    }

    if (vx_ < 0.0f && ballX_ <= 2.0f && ballX_ >= 0.5f &&
        ballY_ >= p1y_ - 0.75f && ballY_ <= p1y_ + float(kPaddle) - 0.25f) {
      ballX_ = 2.0f;
      vx_ = std::fabs(vx_) * 1.035f;
      const float center = p1y_ + float(kPaddle - 1) * 0.5f;
      vy_ += (ballY_ - center) * 3.1f;
      vy_ = clamp(vy_, -18.0f, 18.0f);
    }

    if (vx_ > 0.0f && ballX_ >= float(kWidth - 3) && ballX_ <= float(kWidth) - 0.5f &&
        ballY_ >= p2y_ - 0.75f && ballY_ <= p2y_ + float(kPaddle) - 0.25f) {
      ballX_ = float(kWidth - 3);
      vx_ = -std::fabs(vx_) * 1.035f;
      const float center = p2y_ + float(kPaddle - 1) * 0.5f;
      vy_ += (ballY_ - center) * 3.1f;
      vy_ = clamp(vy_, -18.0f, 18.0f);
    }

    if (ballX_ < -1.0f) {
      ++score2_;
      serveDir_ = -1;
      resetBall();
    } else if (ballX_ > float(kWidth)) {
      ++score1_;
      serveDir_ = 1;
      resetBall();
    }
  }

  void render(Framebuffer& fb) const {
    fb.clear(0);
    for (int y = 0; y < kHeight; y += 2) fb.set(kWidth / 2, y, RGB(24, 24, 24));
    const int y1 = int(std::lround(p1y_));
    const int y2 = int(std::lround(p2y_));
    for (int i = 0; i < kPaddle; ++i) {
      fb.set(1, y1 + i, RGB(80, 200, 255));
      fb.set(kWidth - 2, y2 + i, RGB(255, 120, 185));
    }
    const int bx = int(std::lround(ballX_));
    const int by = int(std::lround(ballY_));
    if (bx >= 0 && bx < kWidth && by >= 0 && by < kHeight) {
      fb.set(bx, by, RGB(255, 255, 255));
    }
    for (uint16_t i = 0; i < std::min<uint16_t>(score1_, 7); ++i) fb.set(4 + int(i), 0, RGB(80, 200, 255));
    for (uint16_t i = 0; i < std::min<uint16_t>(score2_, 7); ++i) fb.set(kWidth - 5 - int(i), 0, RGB(255, 120, 185));
  }

  uint16_t score1() const { return score1_; }
  uint16_t score2() const { return score2_; }
  float ballX() const { return ballX_; }
  float ballY() const { return ballY_; }

 private:
  static constexpr int kPaddle = 4;
  static float clamp(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }

  void resetBall() {
    ballX_ = float(kWidth - 1) * 0.5f;
    ballY_ = float(kHeight - 1) * 0.5f;
    vx_ = 10.5f * float(serveDir_);
    vy_ = (score1_ + score2_) % 2 ? 5.25f : -5.25f;
  }

  float p1y_ = 6.0f;
  float p2y_ = 6.0f;
  float ballX_ = 15.5f;
  float ballY_ = 7.5f;
  float vx_ = 10.5f;
  float vy_ = -5.25f;
  uint16_t score1_ = 0;
  uint16_t score2_ = 0;
  int serveDir_ = 1;
};


class BreakoutGame {
 public:
  BreakoutGame() { reset(); }

  void reset() {
    bricks_ = 0xFFFFFFFFu;
    paddleX_ = 13.0f;
    score_ = 0;
    lives_ = 3;
    gameOver_ = false;
    resetBall();
  }

  void update(const PadState& p, uint32_t dtMs) {
    if (gameOver_) {
      if (p.a) reset();
      return;
    }
    const float dt = float(std::min<uint32_t>(dtMs, 50)) / 1000.0f;
    const float axis = (p.right ? 1.0f : 0.0f) - (p.left ? 1.0f : 0.0f);
    paddleX_ = clamp(paddleX_ + axis * 18.0f * dt, 0.0f, float(kWidth-kPaddle));

    ballX_ += vx_ * dt;
    ballY_ += vy_ * dt;

    if (ballX_ < 0.0f) { ballX_ = -ballX_; vx_ = std::fabs(vx_); }
    if (ballX_ > float(kWidth-1)) { ballX_ = 2.0f*float(kWidth-1)-ballX_; vx_ = -std::fabs(vx_); }
    if (ballY_ < 0.0f) { ballY_ = -ballY_; vy_ = std::fabs(vy_); }

    if (vy_ > 0.0f && ballY_ >= 14.0f && ballY_ <= 15.5f &&
        ballX_ >= paddleX_-0.5f && ballX_ <= paddleX_+float(kPaddle)-0.5f) {
      ballY_ = 14.0f;
      vy_ = -std::fabs(vy_);
      const float center = paddleX_ + float(kPaddle-1)*0.5f;
      vx_ += (ballX_-center)*1.8f;
      vx_ = clamp(vx_, -14.0f, 14.0f);
    }

    const int by = int(std::floor(ballY_+0.35f));
    const int bx = int(std::floor(ballX_));
    if (by >= 1 && by <= 4 && bx >= 0 && bx < kWidth) {
      const int col = bx / 4;
      const int row = by - 1;
      const uint32_t bit = uint32_t(1u) << uint32_t(row*8+col);
      if (bricks_ & bit) {
        bricks_ &= ~bit;
        ++score_;
        vy_ = -vy_;
        if (bricks_ == 0) {
          bricks_ = 0xFFFFFFFFu;
          resetBall();
        }
      }
    }

    if (ballY_ > float(kHeight)+1.0f) {
      if (lives_ > 0) --lives_;
      if (lives_ == 0) gameOver_ = true;
      else resetBall();
    }
  }

  void render(Framebuffer& fb) const {
    fb.clear(0);
    for (int row=0; row<4; ++row) {
      for (int col=0; col<8; ++col) {
        const uint32_t bit=uint32_t(1u)<<uint32_t(row*8+col);
        if (!(bricks_&bit)) continue;
        const uint32_t c = row==0 ? RGB(255,90,90) :
                           row==1 ? RGB(255,180,70) :
                           row==2 ? RGB(90,210,255) : RGB(120,240,130);
        for (int dx=0; dx<3; ++dx) fb.set(col*4+dx,row+1,c);
      }
    }
    const int px=int(std::lround(paddleX_));
    for (int i=0;i<kPaddle;++i) fb.set(px+i,15,RGB(190,220,255));
    const int bx=int(std::lround(ballX_)), by=int(std::lround(ballY_));
    if (bx>=0&&bx<kWidth&&by>=0&&by<kHeight) fb.set(bx,by,RGB(255,255,255));
    if (gameOver_) for (int x=0;x<kWidth;++x) fb.set(x,8,RGB(120,0,0));
  }

  uint16_t score() const { return score_; }
  uint8_t lives() const { return lives_; }
  bool gameOver() const { return gameOver_; }

 private:
  static constexpr int kPaddle=6;
  static float clamp(float v,float lo,float hi){return std::max(lo,std::min(hi,v));}
  void resetBall() {
    ballX_=15.5f; ballY_=11.5f;
    vx_=(score_&1u)?7.5f:-7.5f;
    vy_=-7.5f;
  }
  uint32_t bricks_=0xFFFFFFFFu;
  float paddleX_=13.0f,ballX_=15.5f,ballY_=11.5f,vx_=7.5f,vy_=-7.5f;
  uint16_t score_=0;
  uint8_t lives_=3;
  bool gameOver_=false;
};

class TronGame {
 public:
  enum class Dir : uint8_t { Up, Down, Left, Right };
  TronGame(){reset();}

  void reset(){
    trail_.fill(0);
    p1_={7,8}; p2_={24,8};
    d1_=Dir::Right; d2_=Dir::Left;
    q1_=d1_; q2_=d2_;
    alive1_=alive2_=true;
    elapsedMs_=0;
    trail_[size_t(p1_.y*kWidth+p1_.x)]=1;
    trail_[size_t(p2_.y*kWidth+p2_.x)]=2;
  }

  void update(const PadState& a,const PadState& b,uint32_t dtMs){
    if(!alive1_||!alive2_){
      if(a.a) reset();
      return;
    }
    choose(a,d1_,q1_);
    choose(b,d2_,q2_);
    elapsedMs_+=std::min<uint32_t>(dtMs,100);
    while(elapsedMs_>=95 && alive1_&&alive2_){
      elapsedMs_-=95;
      step();
    }
  }

  void render(Framebuffer& fb) const {
    fb.clear(0);
    for(int y=0;y<kHeight;++y) for(int x=0;x<kWidth;++x){
      const uint8_t v=trail_[size_t(y*kWidth+x)];
      if(v==1) fb.set(x,y,RGB(60,210,255));
      else if(v==2) fb.set(x,y,RGB(255,110,185));
    }
    if(alive1_) fb.set(p1_.x,p1_.y,RGB(210,250,255));
    if(alive2_) fb.set(p2_.x,p2_.y,RGB(255,220,240));
    if(!alive1_||!alive2_){
      for(int x=0;x<kWidth;++x) fb.set(x,0,
        alive1_?RGB(60,210,255):(alive2_?RGB(255,110,185):RGB(150,40,40)));
    }
  }

  bool alive1()const{return alive1_;}
  bool alive2()const{return alive2_;}

 private:
  static bool opposite(Dir a,Dir b){
    return (a==Dir::Up&&b==Dir::Down)||(a==Dir::Down&&b==Dir::Up)||
           (a==Dir::Left&&b==Dir::Right)||(a==Dir::Right&&b==Dir::Left);
  }
  static void choose(const PadState&p,Dir current,Dir&queued){
    Dir d=current; bool changed=true;
    if(p.up)d=Dir::Up; else if(p.down)d=Dir::Down; else if(p.left)d=Dir::Left;
    else if(p.right)d=Dir::Right; else changed=false;
    if(changed&&!opposite(current,d)) queued=d;
  }
  static Point next(Point p,Dir d){
    if(d==Dir::Up)--p.y; else if(d==Dir::Down)++p.y;
    else if(d==Dir::Left)--p.x; else ++p.x;
    return p;
  }
  bool blocked(Point p)const{
    return p.x<0||p.x>=kWidth||p.y<0||p.y>=kHeight||
      trail_[size_t(p.y*kWidth+p.x)]!=0;
  }
  void step(){
    d1_=q1_; d2_=q2_;
    const Point n1=next(p1_,d1_),n2=next(p2_,d2_);
    bool hit1=blocked(n1),hit2=blocked(n2);
    if(n1==n2){hit1=hit2=true;}
    if(n1==p2_&&n2==p1_){hit1=hit2=true;}
    alive1_=!hit1; alive2_=!hit2;
    if(alive1_){p1_=n1;trail_[size_t(p1_.y*kWidth+p1_.x)]=1;}
    if(alive2_){p2_=n2;trail_[size_t(p2_.y*kWidth+p2_.x)]=2;}
  }
  std::array<uint8_t,kPixels> trail_{};
  Point p1_{},p2_{};
  Dir d1_=Dir::Right,d2_=Dir::Left,q1_=Dir::Right,q2_=Dir::Left;
  bool alive1_=true,alive2_=true;
  uint32_t elapsedMs_=0;
};

class TetrisGame {
 public:
  TetrisGame(){reset();}
  void reset(){
    board_.fill(0); score_=0; gameOver_=false; rng_=XorShift32(0x7E7715u);
    heldLeft_=heldRight_=heldRotate_=heldDrop_=false; spawn();
  }

  void update(const PadState&p,uint32_t dtMs){
    if(gameOver_){if(p.a)reset();return;}
    if(p.left&&!heldLeft_&&canPlace(type_,rot_,x_-1,y_))--x_;
    if(p.right&&!heldRight_&&canPlace(type_,rot_,x_+1,y_))++x_;
    if(p.a&&!heldRotate_){
      const int nr=(rot_+1)&3;
      if(canPlace(type_,nr,x_,y_))rot_=nr;
      else if(canPlace(type_,nr,x_-1,y_)){--x_;rot_=nr;}
      else if(canPlace(type_,nr,x_+1,y_)){++x_;rot_=nr;}
    }
    if(p.b&&!heldDrop_){
      while(canPlace(type_,rot_,x_,y_+1))++y_;
      lockPiece(); spawn();
    }
    heldLeft_=p.left; heldRight_=p.right; heldRotate_=p.a; heldDrop_=p.b;

    elapsedMs_+=std::min<uint32_t>(dtMs,100);
    const uint32_t fall=p.down?55:std::max<uint32_t>(120,520-std::min<uint32_t>(score_*8u,400u));
    while(elapsedMs_>=fall&&!gameOver_){
      elapsedMs_-=fall;
      if(canPlace(type_,rot_,x_,y_+1))++y_;
      else {lockPiece();spawn();}
    }
  }

  void render(Framebuffer&fb)const{
    fb.clear(0);
    const int ox=11;
    for(int y=0;y<16;++y)for(int x=0;x<10;++x){
      const uint8_t v=board_[size_t(y*10+x)];
      if(v)fb.set(ox+x,y,colorFor(v-1));
    }
    if(!gameOver_)for(int b=0;b<4;++b){
      Point c=cell(type_,rot_,b);
      const int px=x_+c.x,py=y_+c.y;
      if(py>=0)fb.set(ox+px,py,colorFor(type_));
    }
    if(gameOver_)for(int y=0;y<kHeight;++y){fb.set(9,y,RGB(120,0,0));fb.set(22,y,RGB(120,0,0));}
  }

  uint32_t score()const{return score_;}
  bool gameOver()const{return gameOver_;}

 private:
  inline static constexpr uint16_t masks_[7][4]={
    {0x00F0,0x2222,0x00F0,0x2222},
    {0x0066,0x0066,0x0066,0x0066},
    {0x0027,0x0232,0x0072,0x0131},
    {0x0036,0x0231,0x0036,0x0231},
    {0x0063,0x0132,0x0063,0x0132},
    {0x0071,0x0113,0x0047,0x0322},
    {0x0074,0x0311,0x0017,0x0223}
  };
  static Point cell(int type,int rot,int n){
    const uint16_t m=masks_[type][rot&3];
    int seen=0;
    for(int y=0;y<4;++y)for(int x=0;x<4;++x){
      if(m&(uint16_t(1u)<<uint16_t(y*4+x))){
        if(seen++==n)return Point{int8_t(x),int8_t(y)};
      }
    }
    return {};
  }
  static uint32_t colorFor(int t){
    static constexpr uint32_t c[7]={
      RGB(70,220,255),RGB(255,220,80),RGB(185,90,255),RGB(90,235,120),
      RGB(255,85,95),RGB(90,130,255),RGB(255,160,70)
    };
    return c[t%7];
  }
  bool canPlace(int type,int rot,int px,int py)const{
    for(int i=0;i<4;++i){
      const Point c=cell(type,rot,i); const int x=px+c.x,y=py+c.y;
      if(x<0||x>=10||y>=16)return false;
      if(y>=0&&board_[size_t(y*10+x)]!=0)return false;
    }
    return true;
  }
  void lockPiece(){
    for(int i=0;i<4;++i){
      const Point c=cell(type_,rot_,i); const int x=x_+c.x,y=y_+c.y;
      if(y<0){gameOver_=true;return;}
      board_[size_t(y*10+x)]=uint8_t(type_+1);
    }
    clearLines();
  }
  void clearLines(){
    for(int y=15;y>=0;--y){
      bool full=true;for(int x=0;x<10;++x)if(board_[size_t(y*10+x)]==0){full=false;break;}
      if(!full)continue;
      for(int yy=y;yy>0;--yy)for(int x=0;x<10;++x)board_[size_t(yy*10+x)]=board_[size_t((yy-1)*10+x)];
      for(int x=0;x<10;++x)board_[size_t(x)]=0;
      ++score_; ++y;
    }
  }
  void spawn(){
    type_=rng_.range(7);rot_=0;x_=3;y_=-1;elapsedMs_=0;
    if(!canPlace(type_,rot_,x_,y_))gameOver_=true;
  }
  std::array<uint8_t,160> board_{};
  int type_=0,rot_=0,x_=3,y_=-1;
  uint32_t elapsedMs_=0,score_=0;
  bool gameOver_=false,heldLeft_=false,heldRight_=false,heldRotate_=false,heldDrop_=false;
  XorShift32 rng_{0x7E7715u};
};

class FroggerGame {
 public:
  FroggerGame(){reset();}
  void reset(){x_=15;y_=15;score_=0;lives_=3;timeMs_=0;moveLatch_=false;gameOver_=false;}

  void update(const PadState&p,uint32_t dtMs){
    if(gameOver_){if(p.a)reset();return;}
    timeMs_+=std::min<uint32_t>(dtMs,100);
    const bool move=p.up||p.down||p.left||p.right;
    if(move&&!moveLatch_){
      if(p.up&&y_>0)--y_; else if(p.down&&y_<15)++y_;
      else if(p.left&&x_>0)--x_; else if(p.right&&x_<31)++x_;
      if(y_==0){++score_;x_=15;y_=15;}
    }
    moveLatch_=move;
    if(y_>0&&y_<15&&obstacleAt(x_,y_,timeMs_)){
      if(lives_>0)--lives_;
      x_=15;y_=15;
      if(lives_==0)gameOver_=true;
    }
  }

  void render(Framebuffer&fb)const{
    fb.clear(0);
    for(int x=0;x<kWidth;++x){fb.set(x,0,RGB(30,90,45));fb.set(x,15,RGB(30,90,45));}
    for(int y=1;y<15;++y)for(int x=0;x<kWidth;++x)
      if(obstacleAt(x,y,timeMs_))fb.set(x,y,(y&1)?RGB(255,110,70):RGB(110,165,255));
    fb.set(x_,y_,gameOver_?RGB(120,20,20):RGB(100,255,120));
  }

  uint16_t score()const{return score_;}
  uint8_t lives()const{return lives_;}
  bool gameOver()const{return gameOver_;}

 private:
  static bool obstacleAt(int x,int y,uint32_t t){
    const int dir=(y&1)?1:-1;
    const int speed=18+(y%4)*5;
    int shift=int((t/uint32_t(speed))%32u)*dir;
    int phase=(x+shift+y*3)%9;if(phase<0)phase+=9;
    return phase<3;
  }
  int x_=15,y_=15;
  uint16_t score_=0;
  uint8_t lives_=3;
  uint32_t timeMs_=0;
  bool moveLatch_=false,gameOver_=false;
};

class GameManager {
 public:
  enum class Mode : uint8_t { Menu, Snake, Pong, Breakout, Tron, Tetris, Frogger };

  void reset() {
    mode_ = Mode::Menu;
    menuIndex_ = 0;
    exitHoldMs_ = 0;
    selectLatch_ = false;
    snake_.reset();
    pong_.reset();
    breakout_.reset();
    tron_.reset();
    tetris_.reset();
    frogger_.reset();
  }

  GameManager() { reset(); }

  void update(const PadState& p1, const PadState& p2, uint32_t dtMs) {
    const uint32_t dt = std::min<uint32_t>(dtMs, 100);

    if (mode_ != Mode::Menu) {
      if (p1.start && p1.select) {
        exitHoldMs_ += dt;
        if (exitHoldMs_ >= 800) {
          mode_ = Mode::Menu;
          exitHoldMs_ = 0;
          selectLatch_ = true;
          return;
        }
      } else {
        exitHoldMs_ = 0;
      }
    }

    if (mode_ == Mode::Menu) {
      const bool nav = p1.up || p1.down || p1.left || p1.right;
      if (nav && !selectLatch_) {
        int row = int(menuIndex_) / 2;
        int col = int(menuIndex_) % 2;
        if (p1.up) row = (row + 2) % 3;
        else if (p1.down) row = (row + 1) % 3;
        else if (p1.left || p1.right) col = 1 - col;
        menuIndex_ = uint8_t(row * 2 + col);
      }
      const bool choose = p1.a;
      if (choose && !selectLatch_) {
        switch (menuIndex_) {
          case 0: snake_.reset(); mode_ = Mode::Snake; break;
          case 1: pong_.reset(); mode_ = Mode::Pong; break;
          case 2: breakout_.reset(); mode_ = Mode::Breakout; break;
          case 3: tron_.reset(); mode_ = Mode::Tron; break;
          case 4: tetris_.reset(); mode_ = Mode::Tetris; break;
          default: frogger_.reset(); mode_ = Mode::Frogger; break;
        }
      }
      selectLatch_ = nav || choose || p1.start || p1.select;
      return;
    }

    selectLatch_ = false;
    if (mode_ == Mode::Snake) snake_.update(p1, dt);
    else if (mode_ == Mode::Pong) pong_.update(p1, p2, dt);
    else if (mode_ == Mode::Breakout) breakout_.update(p1, dt);
    else if (mode_ == Mode::Tron) tron_.update(p1, p2, dt);
    else if (mode_ == Mode::Tetris) tetris_.update(p1, dt);
    else if (mode_ == Mode::Frogger) frogger_.update(p1, dt);
  }

  void render(Framebuffer& fb) const {
    if (mode_ == Mode::Snake) { snake_.render(fb); return; }
    if (mode_ == Mode::Pong) { pong_.render(fb); return; }
    if (mode_ == Mode::Breakout) { breakout_.render(fb); return; }
    if (mode_ == Mode::Tron) { tron_.render(fb); return; }
    if (mode_ == Mode::Tetris) { tetris_.render(fb); return; }
    if (mode_ == Mode::Frogger) { frogger_.render(fb); return; }

    fb.clear(0);
    static constexpr uint32_t colors[6] = {
      RGB(90,230,120), RGB(255,120,185), RGB(255,185,70),
      RGB(70,210,255), RGB(185,90,255), RGB(100,255,150)
    };
    for (int i=0;i<6;++i) {
      const int row=i/2,col=i%2;
      const int x0=col?17:1;
      const int y0=1+row*5;
      const bool selected=(i==int(menuIndex_));
      const uint32_t c=selected?colors[i]:RGB(25,45,52);
      for(int y=y0;y<y0+4;++y) for(int x=x0;x<x0+14;++x) {
        if(selected || y==y0 || y==y0+3 || x==x0 || x==x0+13) fb.set(x,y,c);
      }
      // Six compact identifiers: S, P, B, T(r), T(e), F are represented
      // by distinct two-pixel markers so the menu remains readable at 32x16.
      fb.set(x0+2,y0+1,RGB(255,255,255));
      fb.set(x0+3+(i%3),y0+2,RGB(255,255,255));
    }
  }

  Mode mode() const { return mode_; }
  uint8_t menuIndex() const { return menuIndex_; }
  const SnakeGame& snake() const { return snake_; }
  const PongGame& pong() const { return pong_; }
  const BreakoutGame& breakout() const { return breakout_; }
  const TronGame& tron() const { return tron_; }
  const TetrisGame& tetris() const { return tetris_; }
  const FroggerGame& frogger() const { return frogger_; }

 private:
  Mode mode_ = Mode::Menu;
  uint8_t menuIndex_ = 0;
  uint32_t exitHoldMs_ = 0;
  bool selectLatch_ = false;
  SnakeGame snake_;
  PongGame pong_;
  BreakoutGame breakout_;
  TronGame tron_;
  TetrisGame tetris_;
  FroggerGame frogger_;
};

}  // namespace hbnf_game
