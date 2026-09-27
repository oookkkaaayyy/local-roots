#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>
#include "game_core.h"

namespace hbnf_game {

constexpr uint16_t kDdpPort = 4048;
constexpr size_t kDdpHeader = 10;
constexpr size_t kDdpChannelsPerPacket = 1440;
constexpr uint8_t kDdpVersion1 = 0x40;
constexpr uint8_t kDdpPush = 0x01;
constexpr uint8_t kDdpTypeRgb24 = 0x0B;
constexpr uint8_t kDdpDisplayId = 0x01;

struct DdpPacket {
  std::vector<uint8_t> bytes;
};

constexpr size_t kDdpRgbBytes = kPixels * 3;
constexpr size_t kDdpMaxPackets =
    (kDdpRgbBytes + kDdpChannelsPerPacket - 1) / kDdpChannelsPerPacket;

struct DdpFixedPacket {
  std::array<uint8_t, kDdpHeader + kDdpChannelsPerPacket> bytes{};
  size_t length = 0;
};

struct DdpFixedFrame {
  std::array<DdpFixedPacket, kDdpMaxPackets> packets{};
  size_t count = 0;
};

inline void encodeDdpFixed(const Framebuffer& fb, uint8_t& sequence, DdpFixedFrame& out) {
  std::array<uint8_t, kDdpRgbBytes> rgb{};
  for (size_t i = 0; i < fb.px.size(); ++i) {
    const uint32_t c = fb.px[i];
    rgb[i*3+0] = uint8_t((c >> 16) & 0xFF);
    rgb[i*3+1] = uint8_t((c >> 8) & 0xFF);
    rgb[i*3+2] = uint8_t(c & 0xFF);
  }

  out.count = kDdpMaxPackets;
  size_t offset = 0;
  for (size_t packet = 0; packet < out.count; ++packet) {
    const size_t remaining = rgb.size() - offset;
    const size_t payload = remaining < kDdpChannelsPerPacket ? remaining : kDdpChannelsPerPacket;
    const bool last = packet + 1 == out.count;

    auto& p = out.packets[packet];
    p.length = kDdpHeader + payload;
    p.bytes[0] = uint8_t(kDdpVersion1 | (last ? kDdpPush : 0));
    sequence = uint8_t((sequence + 1) & 0x0F);
    p.bytes[1] = sequence;
    p.bytes[2] = kDdpTypeRgb24;
    p.bytes[3] = kDdpDisplayId;
    p.bytes[4] = uint8_t((offset >> 24) & 0xFF);
    p.bytes[5] = uint8_t((offset >> 16) & 0xFF);
    p.bytes[6] = uint8_t((offset >> 8) & 0xFF);
    p.bytes[7] = uint8_t(offset & 0xFF);
    p.bytes[8] = uint8_t((payload >> 8) & 0xFF);
    p.bytes[9] = uint8_t(payload & 0xFF);
    for (size_t i = 0; i < payload; ++i) p.bytes[kDdpHeader+i] = rgb[offset+i];

    offset += payload;
  }
}

inline std::vector<DdpPacket> encodeDdp(const Framebuffer& fb, uint8_t& sequence) {
  std::array<uint8_t, kPixels * 3> rgb{};
  for (size_t i = 0; i < fb.px.size(); ++i) {
    const uint32_t c = fb.px[i];
    rgb[i*3+0] = uint8_t((c >> 16) & 0xFF);
    rgb[i*3+1] = uint8_t((c >> 8) & 0xFF);
    rgb[i*3+2] = uint8_t(c & 0xFF);
  }

  const size_t total = rgb.size();
  const size_t count = (total + kDdpChannelsPerPacket - 1) / kDdpChannelsPerPacket;
  std::vector<DdpPacket> out;
  out.reserve(count);

  size_t offset = 0;
  for (size_t packet = 0; packet < count; ++packet) {
    const size_t remaining = total - offset;
    const size_t payload = remaining < kDdpChannelsPerPacket ? remaining : kDdpChannelsPerPacket;
    const bool last = packet + 1 == count;

    DdpPacket p;
    p.bytes.resize(kDdpHeader + payload);
    p.bytes[0] = uint8_t(kDdpVersion1 | (last ? kDdpPush : 0));
    sequence = uint8_t((sequence + 1) & 0x0F);
    p.bytes[1] = sequence;
    p.bytes[2] = kDdpTypeRgb24;
    p.bytes[3] = kDdpDisplayId;
    p.bytes[4] = uint8_t((offset >> 24) & 0xFF);
    p.bytes[5] = uint8_t((offset >> 16) & 0xFF);
    p.bytes[6] = uint8_t((offset >> 8) & 0xFF);
    p.bytes[7] = uint8_t(offset & 0xFF);
    p.bytes[8] = uint8_t((payload >> 8) & 0xFF);
    p.bytes[9] = uint8_t(payload & 0xFF);
    for (size_t i = 0; i < payload; ++i) p.bytes[kDdpHeader+i] = rgb[offset+i];

    out.push_back(std::move(p));
    offset += payload;
  }
  return out;
}

} // namespace hbnf_game
