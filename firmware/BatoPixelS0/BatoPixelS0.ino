// 預設程式：彩虹流動（跟範例庫的第一個範例相同）
// 給命令列備援 firmware/build.ps1 與 preview/build_wasm.ps1 用；學員的程式由工具頁送到編譯站，不經過這個檔案。
// 格式與規則見 AGENTS.md。
#define PANEL 8              // 燈板：8（8×8）或 16（16×16）
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
