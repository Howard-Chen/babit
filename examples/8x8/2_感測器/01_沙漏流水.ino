// 沙漏流水
// @desc 透明的青色水跟著傾斜流動，聲音越大波越大，拍手會濺起來
// 傾斜燈板，水往低的那邊流（預覽沒有傾斜感測器，會模擬左右搖擺）。
// 做法：tilt 給出畫面上的重力方向，水面用「彈簧＋阻尼」轉過去，所以傾斜時會晃。
// 每一格算出自己在重力方向上有多「低」，找出讓水量固定的水面高度，水面以下點亮；
// 水面那一格只淹到一部分就只亮一部分，水面才會平滑移動。
#define PANEL 8
#include "BatoPixel.h"

const float FILL   = 0.62;   // 水佔畫面的比例
const float SPRING = 60;     // 水面轉向重力的力道：大＝跟得快
const float DAMP   = 4;      // 阻尼：小＝晃得久

// 畫水：down 是「往下」的方向角（0＝畫面右、π/2＝畫面下）；ph 波紋相位、amp 波高、foam 水面泛白 0..1
void drawWater(float down, float ph, float amp, float foam) {
  float dx = cosf(down), dy = sinf(down);
  float s[64];
  for (int i = 0; i < 64; i++) {
    float px = (i % 8) - 3.5f, py = (i / 8) - 3.5f;
    float u = -px * dy + py * dx;                         // 沿著水面的位置
    s[i] = px * dx + py * dy + amp * sinf(1.7f * u - 2 * ph);   // 這格有多「低」＋水面的波
  }
  // 找水面高度 L，讓水的面積剛好是 FILL（二分法）
  float lo = -8, hi = 8, L = 0;
  for (int k = 0; k < 20; k++) {
    L = (lo + hi) / 2;
    float area = 0;
    for (int i = 0; i < 64; i++) area += constrain(s[i] - L + 0.5f, 0.0f, 1.0f);
    if (area > FILL * 64) lo = L; else hi = L;
  }
  for (int i = 0; i < 64; i++) {
    int x = i % 8, y = i / 8;
    float under = s[i] - L + 0.5f;                        // 這格淹到多少：1 以上全淹，0–1 是水面那格
    if (under <= 0) continue;
    float fill = min(under, 1.0f);
    float depth = under - 0.5f;
    // 光斑：兩道斜向的波相乘，形成會飄動的亮塊（0–1）
    float glow = 0.5f + 0.5f * sinf(0.62f * x + 0.40f * y + ph) * sinf(0.38f * x - 0.70f * y - 2 * ph);
    float v = 0.42f + 0.30f * glow + 0.28f * expf(-max(0.0f, depth) / 1.8f);    // 越深越暗、光斑處較亮
    float sat = 255 * (1 - 0.55f * max(0.0f, glow - 0.72f) / 0.28f);           // 最亮的光斑偏白
    if (depth < 0.7f) { v += 0.10f + 0.35f * foam; sat *= 0.88f - 0.5f * foam; }  // 水面那排亮一點、偏白；拍手時更白
    dot(x, y, hsv(180, sat, 255 * constrain(v, 0.12f, 1.0f) * fill));         // 色相 180＝青色
  }
}

void setup() {
  begin();
}

void loop() {
  static float lastT = 0, ang = 1.5708f, vel = 0;        // 水面「往下」的方向角、轉動速度
  static float lvl = 0, foam = 0, ph = 0;                // 聲音大小、水面泛白、波紋相位
  float t = seconds();
  float dt = t - lastT;
  if (dt < 0 || dt > 0.05f) dt = 0.016f;
  lastT = t;

  // 重力方向：燈板平放時畫面上幾乎沒有重力，水面維持原方向
  float gx = tilt.x(), gy = tilt.y();
  if (sqrtf(gx * gx + gy * gy) > 0.25f) {
    float err = atan2f(gy, gx) - ang;
    err = atan2f(sinf(err), cosf(err));                   // 走最短的方向
    vel += (SPRING * err - DAMP * vel) * dt;
  } else {
    vel -= DAMP * vel * dt;
  }
  ang += vel * dt;

  // 聲音：越大聲，波越大、跑越快；有節拍就濺一下（水往一邊甩、水面泛白）
  float snd = audio.level();
  lvl += (snd - lvl) * (snd > lvl ? 0.5f : 0.06f);       // 衝上快、退下慢
  ph += dt * TWO_PI / 2.8f * (1 + 3 * lvl);
  if (audio.beat()) {
    vel += (random(2) ? 1 : -1) * (2.5f + 3 * lvl);
    foam = 1;
  }
  foam = max(0.0f, foam - 2.5f * dt);

  clear();
  drawWater(ang, ph, 0.3f + 1.4f * lvl, foam);
  show();
}
