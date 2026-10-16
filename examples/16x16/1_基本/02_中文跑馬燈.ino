// 中文跑馬燈
// @desc 16×16 點陣中文字由右往左捲動，字身帶彩虹漸層
// @loop 9.8
// 只有 16×16 燈板放得下中文（8×8 只看得懂一到四畫的字）。整條 196 欄、每秒 20 欄，9.8 秒捲完一圈。
// 字型：思源黑體（Noto Sans TC，SIL OFL 授權、可商用）16px，關掉反鋸齒轉成點陣，只收這句話用到的字。
// 每個字 16 排，每排是一個 16 位元的數：最左邊一格是最高位（0x8000），1＝亮。
// 換句子：MSG 裡的字要在字型表裡；要新的字就跑 py examples/cn_font.py "新句子"，把印出來的字型表整段貼進來。
// 捲動的做法跟英文跑馬燈一樣：把整句話攤成一長條「欄」，畫面是 16 欄寬的窗戶，隨時間往右滑。
#define PANEL 16
#include "BatoPixel.h"

const char MSG[] = "你好！我是巴比特燈板";   // 要捲動的句子；字型表沒有的字（含空白）顯示成一格空白
const float SPEED = 20;                       // 每秒捲動幾欄（一個字含字距 18 欄，約一秒一個字）
const int GAP = 2;                            // 字距（欄）

struct Glyph {
  const char* ch;       // 這個字（UTF-8）
  uint16_t rows[16];    // 16 排，最左邊一格是最高位
};

const Glyph FONT[] = {
  {"你", {0x0980, 0x0900, 0x1900, 0x13FF, 0x3223, 0x7622, 0x5020, 0x112C,
          0x1124, 0x1326, 0x1222, 0x1623, 0x1020, 0x10E0, 0x0000, 0x0000}},
  {"好", {0x0000, 0x2000, 0x21FC, 0x2408, 0xFE10, 0x2420, 0x6420, 0x47FE,
          0x4C20, 0x6820, 0x1820, 0x1820, 0x3420, 0x6420, 0x40E0, 0x0000}},
  {"！", {0x0000, 0x0000, 0x0080, 0x0080, 0x0080, 0x0080, 0x0080, 0x0080,
          0x0080, 0x0080, 0x0000, 0x0000, 0x0080, 0x0080, 0x0000, 0x0000}},
  {"我", {0x0F50, 0x784C, 0x0844, 0x0840, 0x7FFE, 0x0840, 0x0844, 0x0B68,
          0x7E38, 0x6830, 0x0862, 0x08D2, 0x0B9A, 0x380E, 0x0000, 0x0000}},
  {"是", {0x0000, 0x1FFC, 0x1004, 0x1FFC, 0x1004, 0x1004, 0x1FFC, 0x0000,
          0x7FFE, 0x0180, 0x0980, 0x19FC, 0x1D80, 0x2780, 0x61FE, 0x0000}},
  {"巴", {0x0000, 0x7FFC, 0x7FFC, 0x610C, 0x610C, 0x610C, 0x610C, 0x7FFC,
          0x7FFC, 0x6000, 0x6000, 0x6000, 0x6002, 0x6006, 0x3FFC, 0x0000}},
  {"比", {0x0000, 0x3060, 0x3060, 0x3060, 0x3060, 0x3060, 0x3F7E, 0x3060,
          0x3060, 0x3060, 0x3060, 0x3061, 0x3161, 0x3E61, 0x207E, 0x0000}},
  {"特", {0x0000, 0x0810, 0x28FE, 0x3E10, 0x3E10, 0x28FE, 0x48FE, 0x4804,
          0x0804, 0x0FFE, 0x7804, 0x0844, 0x0824, 0x0804, 0x081C, 0x0000}},
  {"燈", {0x13D6, 0x105C, 0x578B, 0x558E, 0x55FE, 0x5A03, 0x11FC, 0x1104,
          0x1104, 0x11FC, 0x388C, 0x2488, 0x24C8, 0x43FF, 0x0000, 0x0000}},
  {"板", {0x0000, 0x13FE, 0x1300, 0x1300, 0x7F00, 0x1300, 0x33FE, 0x3B84,
          0x3B4C, 0x574C, 0x5338, 0x9230, 0x1238, 0x16CC, 0x1486, 0x0000}},
};

// MSG 從 p 開始是不是這個字（UTF-8 逐位元組比對）
bool startsWith(const char* p, const char* s) {
  while (*s) if (*p++ != *s++) return false;
  return true;
}

// UTF-8 一個字佔幾個位元組（看第一個位元組就知道：中文多半是 3）
int utf8Len(char c) {
  unsigned char u = (unsigned char)c;
  if (u >= 0xF0) return 4;
  if (u >= 0xE0) return 3;
  if (u >= 0xC0) return 2;
  return 1;
}

void setup() {
  begin();
}

void loop() {
  // 第一次呼叫時把 MSG 拆成一個個字、找出各自在字型表的哪一筆（找不到＝空白）
  static const Glyph* seq[64];
  static int n = -1;
  if (n < 0) {
    n = 0;
    for (const char* p = MSG; *p && n < 64; ) {
      const Glyph* g = nullptr;
      for (const Glyph& f : FONT)
        if (startsWith(p, f.ch)) { g = &f; break; }
      seq[n++] = g;
      p += utf8Len(*p);                   // 往下一個字
    }
  }

  const int ADV = 16 + GAP;               // 每個字佔幾欄
  const int LEAD = WIDTH;                 // 開頭空一整個畫面，字從右邊進場
  const int TOTAL = LEAD + n * ADV;       // 整條有幾欄
  int shift = (int)(seconds() * SPEED) % TOTAL;   // 現在捲到第幾欄

  clear();
  for (int x = 0; x < WIDTH; x++) {
    int col = (shift + x) % TOTAL;        // 畫面第 x 欄＝整條的第幾欄
    if (col < LEAD) continue;             // 開頭的空白
    int i = (col - LEAD) / ADV;           // 第幾個字
    int c = (col - LEAD) % ADV;           // 字裡的第幾欄（16、17 是字距）
    if (c >= 16 || seq[i] == nullptr) continue;

    Color color = hsv((col - LEAD) * 2, 255, 255);   // 越後面的字色相越大：整句剛好繞色環一圈
    for (int y = 0; y < 16; y++)
      if (seq[i]->rows[y] & (0x8000 >> c)) dot(x, y, color);
  }
  show();
}
