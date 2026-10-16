// 按鈕切換模式
// @desc 按鈕 1 換圖案、按鈕 2 暫停／繼續、旋鈕調速度；燒進板子也能檢查按鈕和旋鈕有沒有焊好
// @loop 3.6
// 焊接檢查：按鈕 1 每按一次換圖案（彩色直條 → 星星 → 呼吸），按鈕 2 讓畫面停住（右上角亮紅點），
// 轉旋鈕時動畫平順地變快變慢。哪一個沒反應或亂跳，就檢查那個零件的焊點。
// 預覽沒有實體的旋鈕和按鈕：用預覽畫面下方的滑桿和「按鈕 1」「按鈕 2」。
#define PANEL 8
#include "BatoPixel.h"

int mode = 0;              // 現在是第幾種圖案（0、1、2）
bool paused = false;       // 有沒有暫停
float t = 0;               // 動畫自己的時間：暫停時不前進
float lastSec = 0;         // 上一格的 seconds()

void setup() {
  begin();
}

void loop() {
  float now = seconds();
  float dt = now - lastSec;                          // 跟上一格差幾秒（大約 1/60）
  lastSec = now;
  if (dt > 0.1f) dt = 0.1f;

  if (button1.clicked()) mode = (mode + 1) % 3;      // 按一下按鈕 1：換下一種圖案
  if (button2.clicked()) paused = !paused;           // 按一下按鈕 2：暫停／繼續
  float speed = knob.value() * 2;                    // 旋鈕調速度：中間是原本的速度，順時針最快 2 倍，轉到底停住
  if (!paused) t += dt * speed;                      // 暫停時動畫時間停住，畫面也停住

  clear();
  if (mode == 0) {                                   // 圖案 1：彩色直條往右流
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, hsv(x * 45 - t * 100, 255, 255));
  } else if (mode == 1) {                            // 圖案 2：星星閃爍
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
      float s = sinf(t * 3 + i * 1.7f);              // 每顆星星的閃爍時間錯開
      if (s > 0.6f) dot(i % WIDTH, i / WIDTH, dim(WHITE, (s - 0.6f) / 0.4f));
    }
  } else {                                           // 圖案 3：整面呼吸
    float k = 0.5f - 0.5f * cosf(t * 2);
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, dim(CYAN, k));
  }
  if (paused) dot(WIDTH - 1, 0, RED);                // 暫停中：右上角亮一顆紅點
  show();
}
