#pragma once
// Minimal HBNF paging/placement glue over WLED 16.0.1's FontManager.
// WLED owns font data, glyph metrics, caching, and pixel rasterization.
#include <stdint.h>
#include <string.h>

namespace HbnfNativeText {
template<class FontT>
static inline uint8_t glyphWidth(FontT& font, uint8_t code) {
  if (code < 32 || code > 126) code = '?';
  return font.getGlyphWidth(code);
}

template<class FontT>
static inline uint16_t textWidth(FontT& font, const char* text) {
  if (!text || !*text) return 0;
  uint16_t width = 0;
  uint8_t count = 0;
  const uint8_t spacing = font.getFontSpacing();
  for (const uint8_t* p = reinterpret_cast<const uint8_t*>(text); *p; ++p) {
    if (count++) width = static_cast<uint16_t>(width + spacing);
    width = static_cast<uint16_t>(width + glyphWidth(font, *p));
  }
  return width;
}

static inline void copyText(char* out, const char* in, size_t capacity) {
  if (!capacity) return;
  size_t i = 0;
  if (in) while (i + 1 < capacity && in[i]) { out[i] = in[i]; ++i; }
  out[i] = '\0';
}

template<class FontT>
static inline void draw(FontT& font, const char* text, int16_t x,
                        int16_t y, uint32_t color,uint32_t color2=0,uint8_t alpha=255) {
  if (!text || !*text) return;
  const uint8_t spacing = font.getFontSpacing();
  for (const uint8_t* p = reinterpret_cast<const uint8_t*>(text); *p; ++p) {
    const uint8_t code = (*p >= 32 && *p <= 126) ? *p : '?';
    const uint8_t width = font.getGlyphWidth(code);
    font.drawCharacter(code, x, y, color, color2?color2:color, 0, alpha);
    x = static_cast<int16_t>(x + width + spacing);
  }
}

template<class FontT>
static inline uint8_t packPage(FontT& font, const char* text,
                               uint8_t wanted, char out[64]) {
  char current[64]{};
  uint8_t page = 0;
  size_t pos = 0;
  const size_t length = text ? strlen(text) : 0;
  while (pos < length) {
    while (pos < length && (text[pos] == ' ' || text[pos] == '\n' ||
           text[pos] == '\r' || text[pos] == '\t')) ++pos;
    if (pos >= length) break;
    char word[64]{};
    size_t n = 0;
    while (pos < length && text[pos] != ' ' && text[pos] != '\n' &&
           text[pos] != '\r' && text[pos] != '\t' && n < sizeof(word)-1) {
      const char c = text[pos++];
      word[n++] = (c >= 'a' && c <= 'z') ? static_cast<char>(c - 'a' + 'A') : c;
    }
    while (pos < length && text[pos] != ' ' && text[pos] != '\n' &&
           text[pos] != '\r' && text[pos] != '\t') ++pos;
    word[n] = '\0';
    char joined[64]{};
    copyText(joined, current, sizeof(joined));
    const size_t used = strlen(joined);
    if (used && used < sizeof(joined)-1) {
      joined[used] = ' '; copyText(joined + used + 1, word, sizeof(joined)-used-1);
    } else copyText(joined, word, sizeof(joined));
    if (*current && textWidth(font, joined) > 32) {
      if (page == wanted) copyText(out, current, 64);
      ++page;
      current[0] = '\0';
      copyText(current, word, sizeof(current));
    } else copyText(current, joined, sizeof(current));
  }
  if (*current) { if (page == wanted) copyText(out, current, 64); ++page; }
  if (!page) { if (wanted == 0) out[0] = '\0'; return 1; }
  return page;
}

template<class FontT>
static inline void drawPaged(FontT& font, const char* text,
                             uint32_t elapsedMs, uint8_t canvasWidth,
                             uint8_t canvasHeight, uint32_t color,
                             uint16_t pageHoldMs = 2200,uint32_t color2=0,
                             uint8_t alpha=255,int8_t yOffset=0) {
  if (!text || !*text) return;
  char pageText[64]{};
  const uint8_t count = packPage(font, text, 0, pageText);
  const uint8_t page = static_cast<uint8_t>((elapsedMs / pageHoldMs) % count);
  packPage(font, text, page, pageText);
  const uint16_t width = textWidth(font, pageText);
  int16_t x = static_cast<int16_t>(canvasWidth - width) / 2;
  const int16_t y = static_cast<int16_t>((canvasHeight - font.getFontHeight()) / 2)+yOffset;
  if (width > canvasWidth) {
    const uint16_t travel = static_cast<uint16_t>(width - canvasWidth);
    const uint16_t phase = static_cast<uint16_t>(elapsedMs % pageHoldMs);
    const uint16_t scrollDuration = pageHoldMs > 300 ? pageHoldMs - 300 : pageHoldMs;
    const uint16_t active = phase > 300 ? phase - 300 : 0;
    x = static_cast<int16_t>(-((uint32_t)travel *
        (active > scrollDuration ? scrollDuration : active) / scrollDuration));
  }
  draw(font, pageText, x, y, color,color2,alpha);
}
} // namespace HbnfNativeText
