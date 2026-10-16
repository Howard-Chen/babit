// 燈序測試 2：三角定位（取代舊的 student.h TEST_MODE 2）
// 設定好 BatoPixel.h 的排列旗標（BP_SERPENTINE／BP_TRANSPOSE）後驗證：應該看到左上紅、右上綠、左下藍。
#define PANEL 16             // 測幾乘幾的燈板就寫幾
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  clear();
  dot(0, 0, RED);                  // 左上
  dot(WIDTH - 1, 0, GREEN);        // 右上
  dot(0, HEIGHT - 1, BLUE);        // 左下
  show();
}
