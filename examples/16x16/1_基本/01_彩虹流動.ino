// 彩虹流動
// @desc 每一格的色相由位置決定，整面彩虹持續流動
// @loop 3.6
// 16×16 燈板版：跟 8×8 一樣的程式，只有第一行的 PANEL 不同（迴圈用 WIDTH、HEIGHT，尺寸自動跟著變）。
#define PANEL 16             // 燈板：8（8×8）或 16（16×16）
#include "BatoPixel.h"

void setup() {
  begin();                   // 啟動燈板、麥克風、傾斜感測、旋鈕
}

void loop() {                // 每 1/60 秒執行一次，每次畫出「現在這一格」
  float t = seconds();       // 開機後第幾秒，動畫都用它來算
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++)
      dot(x, y, hsv((x + y) * 20 + t * 100, 255, 255));
  show();                    // 送出這一格，並自動等到下一格的時間
}
