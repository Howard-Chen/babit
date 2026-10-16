// FFT 頻譜
// @desc 麥克風收音做 FFT，八個頻段隨音樂跳動
// 有麥克風（板子接好 INMP441，或網頁按「🎤 開啟麥克風」）：每一欄是一個頻段的音量，左邊低音、右邊高音。
// 沒有麥克風：模擬約 128 BPM 的鼓組——大鼓每拍打低頻、小鼓隔拍打中頻、腳踏鈸每半拍打高頻，
//   再加上每 50 毫秒變一次的隨機抖動。
// 兩種都是長條「瞬間衝上、快速落下」，跟真的頻譜儀一樣。
// 旋鈕調麥克風靈敏度（順時針越靈敏）：loop() 第一行的 audio.sensitivity(knob.value())，拿掉就是固定的一般靈敏度。
#define PANEL 8
#include "BatoPixel.h"

// 可重複的亂數：同一個頻段、同一個時間格永遠得到同一個值（0..1）
float noise01(int b, int step) {
  uint32_t h = (uint32_t)b * 374761393u + (uint32_t)step * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h ^= h >> 16;
  return (h & 0xFFFF) / 65535.0f;
}

// 沒有麥克風時的假頻譜：第 b 個頻段在時間 t 的音量（0..1 左右）
float fakeBand(int b, float t) {
  const float BEAT = 2.8f / 6;                              // 一拍 0.467 秒（約 128 BPM）
  float kick  = expf(-fmodf(t, BEAT) / 0.07f);              // 大鼓：每拍，70 毫秒就退掉
  float snare = expf(-fmodf(t + BEAT, 2 * BEAT) / 0.09f);   // 小鼓：隔拍
  float hat   = expf(-fmodf(t, BEAT / 2) / 0.04f);          // 腳踏鈸：每半拍，很短
  int step = (int)floorf(t * 20) % 56;                      // 抖動每 50 毫秒換一次

  // 每個頻段 = 底 + 大鼓 + 小鼓 + 腳踏鈸 + 抖動（低頻吃大鼓、中頻吃小鼓、高頻吃腳踏鈸）
  const float base[8]  = {0.35f, 0.30f, 0.30f, 0.25f, 0.25f, 0.20f, 0.15f, 0.10f};
  const float kickW[8] = {0.65f, 0.60f, 0.25f, 0.05f, 0.00f, 0.00f, 0.00f, 0.00f};
  const float snrW[8]  = {0.00f, 0.05f, 0.35f, 0.45f, 0.40f, 0.25f, 0.10f, 0.00f};
  const float hatW[8]  = {0.00f, 0.00f, 0.00f, 0.05f, 0.10f, 0.35f, 0.50f, 0.55f};
  const float jitW[8]  = {0.10f, 0.15f, 0.20f, 0.25f, 0.30f, 0.25f, 0.30f, 0.30f};
  return base[b] + kickW[b] * kick + snrW[b] * snare + hatW[b] * hat + jitW[b] * noise01(b, step);
}

void setup() {
  begin();
}

void loop() {
  audio.sensitivity(knob.value());      // 旋鈕調靈敏度：轉到中間是一般，順時針越靈敏，轉到底等於關掉
  static float level[8];                // 目前顯示的高度（格）
  static float lastT = 0;
  float t = seconds();
  float dt = t - lastT;                 // 距離上一格幾秒，讓落下速度與幀率無關
  if (dt < 0 || dt > 0.5f) dt = 0;
  lastT = t;

  clear();
  for (int b = 0; b < 8; b++) {
    float v;
    if (audio.ready()) v = audio.band(b);    // 有麥克風：這個頻段的真實音量 0..1
    else v = fakeBand(b, t);                 // 沒有麥克風：模擬鼓組
    float target = constrain(v * 8, 0.6f, 8.0f);

    // 瞬間衝上、快速落下（每秒掉 24 格）
    if (target > level[b]) level[b] = target;
    else level[b] = max(target, level[b] - 24.0f * dt);

    int hue = b * 40;                              // 低頻紅 → 高頻紫
    for (int r = 0; r < 8; r++) {
      float fill = constrain(level[b] - r, 0.0f, 1.0f);   // 最上面那格依高度部分點亮
      if (fill <= 0) break;
      float bright = (110.0f + 145.0f * r / 7.0f) * fill;   // 越高越亮
      dot(b, 7 - r, hsv(hue, 255, bright));
    }
  }
  show();
}
