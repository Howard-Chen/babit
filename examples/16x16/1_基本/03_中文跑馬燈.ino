// 中文跑馬燈
// @desc 16×16 點陣中文字由右往左捲動；旋鈕調速度、按鈕 1 換句子、按鈕 2 換顏色
// @loop 9.8
// 旋鈕：捲動速度（中間＝每秒 20 欄，約一秒一個字；轉到最左也還在慢慢捲）
// 按鈕 1：換下一句（TEXTS 裡的句子輪流，換了從右邊重新進場）
// 按鈕 2：換顏色（彩虹隨字 → 紅 → 黃 → 綠 → 藍 → 白）
// 亮度：BRIGHT 調整整面亮度（0–1，沒寫是 0.6）。16×16 的燈很多、字又亮得很集中，比整面亮的範例刺眼，所以調得更暗。
// 只有 16×16 燈板放得下中文（8×8 只看得懂一到四畫的字）。第一句整條 196 欄，中間速度 9.8 秒捲完一圈。
// 字型：思源黑體（Noto Sans TC，SIL OFL 授權、可商用）16px，關掉反鋸齒轉成點陣，只收句子用到的字。
// 每個字 16 排，每排是一個 16 位元的數：最左邊一格是最高位（0x8000），1＝亮。
// 換句子：句子裡的字要在字型表裡；要新的字就把所有句子接在一起跑 py examples/cn_font.py "全部的句子"，
//   把印出來的字型表整段貼進來。
// 捲動的做法跟英文跑馬燈一樣：把整句話攤成一長條「欄」，畫面是 16 欄寬的窗戶，隨時間往右滑。
#define PANEL 16
#include "BatoPixel.h"

const char* const TEXTS[] = {"你好！我是巴比特燈板", "歡迎來到巴特電氣"};   // 要捲動的句子；字型表沒有的字（含空白）顯示成一格空白
const int COUNT = sizeof(TEXTS) / sizeof(TEXTS[0]);                      // 有幾句
const Color COLORS[] = {RED, YELLOW, GREEN, BLUE, WHITE};                 // 按鈕 2 的單色（彩虹隨字之後依序換）
const int GAP = 2;                            // 字距（欄）
const float BRIGHT = 0.12;                    // 整面亮度 0–1：覺得太暗就調大，最大 1（板子會自動限制在安全範圍內）

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
  {"歡", {0x73A0, 0x1020, 0x007F, 0x7742, 0x5556, 0x7754, 0x3F10, 0x3F10,
          0x6418, 0xBF38, 0x2428, 0x3F24, 0x3F46, 0x3FC3, 0x0000, 0x0000}},
  {"迎", {0x60C0, 0x333C, 0x1224, 0x7A24, 0x1224, 0x2224, 0x6224, 0x7A24,
          0x1BE4, 0x172C, 0x1020, 0x3020, 0x2C00, 0x47FE, 0x0000, 0x0000}},
  {"來", {0x0000, 0x0100, 0x0100, 0x7FFC, 0x0110, 0x1910, 0x1130, 0x3938,
          0x67CC, 0x4384, 0x0540, 0x1930, 0x3118, 0xE10E, 0x0100, 0x0000}},
  {"到", {0x0000, 0x7F84, 0x1824, 0x1224, 0x3124, 0x7FA4, 0x30A4, 0x0424,
          0x0424, 0x3FA4, 0x0424, 0x0484, 0x0F84, 0x7C04, 0x401C, 0x0000}},
  {"電", {0x0000, 0x3FFC, 0x0100, 0x7FFC, 0x510C, 0x4D74, 0x4D70, 0x1108,
          0x3FFC, 0x310C, 0x3FFC, 0x310C, 0x3FFE, 0x3102, 0x01FC, 0x0000}},
  {"氣", {0x0000, 0x0800, 0x1FFE, 0x3000, 0x2FFC, 0x4000, 0x3FF8, 0x0208,
          0x12C8, 0x0288, 0x7FE8, 0x0208, 0x1A89, 0x3269, 0x6226, 0x0000}},
};

// 句子從 p 開始是不是這個字（UTF-8 逐位元組比對）
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

const Glyph* seq[64];       // 現在這句拆成一個個字，各自在字型表的哪一筆（找不到＝空白）
int n = 0;                  // 現在這句有幾個字
int which = -1;             // 現在是第幾句（-1＝還沒拆過）
int colorMode = 0;          // 0＝彩虹隨字，1 之後是 COLORS 裡的單色
float pos = 0;              // 捲到第幾欄（有小數）：每格加上「速度 × 經過的秒數」，轉旋鈕時才不會跳
float lastT = 0;            // 上一格的 seconds()

// 把第 w 句拆成一個個字
void useText(int w) {
  which = w;
  n = 0;
  for (const char* p = TEXTS[w]; *p && n < 64; ) {
    const Glyph* g = nullptr;
    for (const Glyph& f : FONT)
      if (startsWith(p, f.ch)) { g = &f; break; }
    seq[n++] = g;
    p += utf8Len(*p);                     // 往下一個字
  }
}

void setup() {
  begin();
  brightness(BRIGHT);       // 整面亮度（沒寫是 0.6）
}

void loop() {
  float t = seconds();
  float dt = t - lastT;                   // 跟上一格差幾秒（大約 1/60）
  lastT = t;

  if (which < 0) useText(0);
  if (button1.clicked()) { useText((which + 1) % COUNT); pos = 0; }   // 按一下按鈕 1：換下一句，從右邊重新進場
  if (button2.clicked()) colorMode = (colorMode + 1) % 6;            // 按一下按鈕 2：換下一種顏色
  float speed = 20 * powf(3, knob.value() * 2 - 1);                  // 旋鈕：每秒捲幾欄（最左約 7、中間 20、最右 60）

  const int ADV = 16 + GAP;               // 每個字佔幾欄
  const int LEAD = WIDTH;                 // 開頭空一整個畫面，字從右邊進場
  const int TOTAL = LEAD + n * ADV;       // 整條有幾欄
  pos = fmodf(pos + speed * dt, TOTAL);
  int shift = (int)pos;                   // 現在捲到第幾欄

  clear();
  for (int x = 0; x < WIDTH; x++) {
    int col = (shift + x) % TOTAL;        // 畫面第 x 欄＝整條的第幾欄
    if (col < LEAD) continue;             // 開頭的空白
    int i = (col - LEAD) / ADV;           // 第幾個字
    int c = (col - LEAD) % ADV;           // 字裡的第幾欄（16、17 是字距）
    if (c >= 16 || seq[i] == nullptr) continue;

    Color color = colorMode == 0 ? hsv((col - LEAD) * 2, 255, 255)   // 彩虹隨字：越後面的字色相越大
                                 : COLORS[colorMode - 1];
    for (int y = 0; y < 16; y++)
      if (seq[i]->rows[y] & (0x8000 >> c)) dot(x, y, color);
  }
  show();
}
