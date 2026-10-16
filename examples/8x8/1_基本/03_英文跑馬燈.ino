// 英文跑馬燈 HELLO
// @desc 3×5 點陣字由右往左捲動，字身帶彩虹漸層
// 字型是自己畫的：每個字 5 排、每排 3 格，'#' 亮、'.' 暗。想加字就照格式多畫一個。
// 捲動的做法：把整句話攤成一長條「欄」，畫面是 WIDTH 欄寬的窗戶，隨時間往右滑。
#define PANEL 8
#include "BatoPixel.h"

const char MSG[] = "HELLO";         // 要捲動的字（目前字型只有 H、E、L、O）
const int LEN = sizeof(MSG) - 1;    // 字數（sizeof 會多算結尾的 '\0'）
const float SPEED = 10;             // 每秒捲動幾欄
const int TOP = 1;                  // 字從第幾排開始畫：5 排高放第 1–5 排，看起來最像置中

struct Glyph {
  char ch;
  const char* rows[5];
};

const Glyph FONT[] = {
  {'H', {"#.#", "#.#", "###", "#.#", "#.#"}},
  {'E', {"###", "#..", "##.", "#..", "###"}},
  {'L', {"#..", "#..", "#..", "#..", "###"}},
  {'O', {"###", "#.#", "#.#", "#.#", "###"}},
};

// 在字型表裡找這個字；找不到就當成空白
const Glyph* findGlyph(char ch) {
  for (const Glyph& g : FONT)
    if (g.ch == ch) return &g;
  return nullptr;
}

void setup() {
  begin();
}

void loop() {
  const int LEAD = WIDTH;                 // 開頭空一整個畫面，字從右邊進場
  const int TOTAL = LEAD + LEN * 4;       // 整條有幾欄：每個字 3 欄＋1 欄字距
  int shift = (int)(seconds() * SPEED) % TOTAL;   // 現在捲到第幾欄

  clear();
  for (int x = 0; x < WIDTH; x++) {
    int col = (shift + x) % TOTAL;        // 畫面第 x 欄＝整條的第幾欄
    if (col < LEAD) continue;             // 開頭的空白
    int n = (col - LEAD) / 4;             // 第幾個字
    int c = (col - LEAD) % 4;             // 字裡的第幾欄（第 3 欄是字距）
    const Glyph* g = findGlyph(MSG[n]);
    if (c == 3 || g == nullptr) continue;

    Color color = hsv((col - LEAD) * 11, 255, 255);   // 越後面的字色相越大：紅 → 藍
    for (int y = 0; y < 5; y++)
      if (g->rows[y][c] == '#') dot(x, TOP + y, color);
  }
  show();
}
