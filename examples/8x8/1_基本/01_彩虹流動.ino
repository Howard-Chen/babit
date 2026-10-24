// 彩虹流動
// @desc 整面彩虹持續流動；旋鈕調速度、按鈕 1 換方向、按鈕 2 換色系
// @loop 3.6
// 課程的第一個範例：第一次點亮板子時跑的就是這個。
// 旋鈕：流動速度（中間＝每秒轉 100°，3.6 秒轉完一圈；轉到最左也還在慢慢流）
// 按鈕 1：換方向（斜向 → 橫向 → 直向 → 從中間往外擴散）
// 按鈕 2：換色系（全彩虹 → 暖色 → 冷色 → 粉彩）
#define PANEL 8              // 燈板：8（8×8）或 16（16×16）
#include "BatoPixel.h"

int dir = 0;                 // 現在的方向：0 斜向、1 橫向、2 直向、3 擴散
int palette = 0;             // 現在的色系：0 全彩虹、1 暖色、2 冷色、3 粉彩
float phase = 0;             // 彩虹轉到幾度：每格加上「速度 × 經過的秒數」，轉旋鈕時畫面才不會跳
float lastT = 0;             // 上一格的 seconds()

// 把彩虹的色相 h 換成現在色系的顏色
Color paint(float h) {
  float s = sinf(radians(h));                              // 跟著色相在 -1～1 之間來回
  if (palette == 1) return hsv(25 + 25 * s, 255, 255);    // 暖色：紅 → 橘 → 黃
  if (palette == 2) return hsv(200 + 45 * s, 255, 255);   // 冷色：青 → 藍 → 靛
  if (palette == 3) return hsv(h, 110, 255);               // 粉彩：顏色淡一點
  return hsv(h, 255, 255);                                 // 全彩虹
}

void setup() {
  begin();                   // 啟動燈板、麥克風、傾斜感測、旋鈕
}

void loop() {                // 每 1/60 秒執行一次，每次畫出「現在這一格」
  float t = seconds();       // 開機後第幾秒
  float dt = t - lastT;      // 跟上一格差幾秒（大約 1/60）
  lastT = t;

  if (button1.clicked()) dir = (dir + 1) % 4;             // 按一下按鈕 1：換下一個方向
  if (button2.clicked()) palette = (palette + 1) % 4;     // 按一下按鈕 2：換下一個色系
  float speed = 100 * powf(4, knob.value() * 2 - 1);      // 旋鈕：每秒轉幾度（最左 25、中間 100、最右 400）
  phase = fmodf(phase + speed * dt, 360);

  float cx = (WIDTH - 1) / 2.0f, cy = (HEIGHT - 1) / 2.0f;    // 畫面中心
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) {
      float pos;                                          // 這一格在彩虹上的位置（度）
      if (dir == 0) pos = (x + y) * 20;                   // 斜向
      else if (dir == 1) pos = x * 40;                    // 橫向
      else if (dir == 2) pos = y * 40;                    // 直向
      else pos = -sqrtf(sq(x - cx) + sq(y - cy)) * 45;    // 擴散：離中心越遠色相越小，圈圈往外跑
      dot(x, y, paint(pos + phase));
    }
  show();                    // 送出這一格，並自動等到下一格的時間
}
