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

class GameManager {
 public:
  enum class Mode : uint8_t { Menu, Snake, Pong };

  void reset() {
    mode_ = Mode::Menu;
    menuIndex_ = 0;
    exitHoldMs_ = 0;
    selectLatch_ = false;
    snake_.reset();
    pong_.reset();
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
      const bool nav = p1.up || p1.down;
      if (nav && !selectLatch_) menuIndex_ = uint8_t(1 - menuIndex_);
      const bool choose = p1.a;
      if (choose && !selectLatch_) {
        if (menuIndex_ == 0) { snake_.reset(); mode_ = Mode::Snake; }
        else { pong_.reset(); mode_ = Mode::Pong; }
      }
      selectLatch_ = nav || choose || p1.start || p1.select;
      return;
    }

    selectLatch_ = false;
    if (mode_ == Mode::Snake) snake_.update(p1, dt);
    else if (mode_ == Mode::Pong) pong_.update(p1, p2, dt);
  }

  void render(Framebuffer& fb) const {
    if (mode_ == Mode::Snake) { snake_.render(fb); return; }
    if (mode_ == Mode::Pong) { pong_.render(fb); return; }

    fb.clear(0);
    const uint32_t selected = RGB(110, 220, 120);
    const uint32_t idle = RGB(35, 70, 40);
    for (int x = 4; x < 28; ++x) fb.set(x, 4, menuIndex_ == 0 ? selected : idle);
    for (int x = 4; x < 28; ++x) fb.set(x, 11, menuIndex_ == 1 ? selected : idle);
    // Tiny identifying glyphs: S and P.
    fb.set(2,3,RGB(255,255,255)); fb.set(1,3,RGB(255,255,255)); fb.set(1,4,RGB(255,255,255));
    fb.set(1,5,RGB(255,255,255)); fb.set(2,5,RGB(255,255,255)); fb.set(2,6,RGB(255,255,255));
    fb.set(1,10,RGB(255,255,255)); fb.set(1,11,RGB(255,255,255)); fb.set(1,12,RGB(255,255,255));
    fb.set(2,10,RGB(255,255,255)); fb.set(2,11,RGB(255,255,255));
  }

  Mode mode() const { return mode_; }
  uint8_t menuIndex() const { return menuIndex_; }
  const SnakeGame& snake() const { return snake_; }
  const PongGame& pong() const { return pong_; }

 private:
  Mode mode_ = Mode::Menu;
  uint8_t menuIndex_ = 0;
  uint32_t exitHoldMs_ = 0;
  bool selectLatch_ = false;
  SnakeGame snake_;
  PongGame pong_;
};

}  // namespace hbnf_game
