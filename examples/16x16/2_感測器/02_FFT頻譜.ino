// FFT 頻譜
// @desc 麥克風收音做 FFT，每一欄一個頻段隨音樂跳動；旋鈕調靈敏度、按鈕 1 換樣式、按鈕 2 換顏色
// 16×16 燈板版：跟 8×8 一樣的程式，只差 PANEL 和亮度（WIDTH、HEIGHT、BANDS 自動跟著變）。
// 亮度：16×16 的燈是 8×8 的四倍，整面很刺眼，所以用 BRIGHT 調暗（0–1，沒寫是 0.6）。想亮一點就調大。
// 旋鈕：麥克風靈敏度（中間＝一般，順時針越靈敏；轉到最左很不靈敏，但不會整個關掉）
// 按鈕 1：換樣式（長條 → 從中間往上下長 → 長條加上慢慢掉的頂端白點）
// 按鈕 2：換顏色（每個頻段一色 ↔ 依高度變色：下綠、中黃、上紅）
// 有麥克風（板子接好 INMP441，或網頁按「🎤 開啟麥克風」）：每一欄是一個頻段的音量，左邊低音、右邊高音。
//   頻段數 BANDS 跟著燈板：8×8 是 8 段、16×16 是 16 段，剛好一欄一段。
// 沒有麥克風：模擬約 128 BPM 的鼓組——大鼓每拍打低頻、小鼓隔拍打中頻、腳踏鈸每半拍打高頻，
//   再加上每 50 毫秒變一次的隨機抖動。
// 長條都是「瞬間衝上、快速落下」，跟真的頻譜儀一樣；最底下那排一直亮著，看得出程式在跑。
#define PANEL 16
#include "BatoPixel.h"

const float BRIGHT = 0.24;       // 整面亮度 0–1

// 可重複的亂數：同一個頻段、同一個時間格永遠得到同一個值（0..1）
float noise01(int b, int step) {
  uint32_t h = (uint32_t)b * 374761393u + (uint32_t)step * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h ^= h >> 16;
  return (h & 0xFFFF) / 65535.0f;
}

// 8 個權重之間取第 p 個位置的值（p 可以有小數）：頻段比 8 段多時，用相鄰兩個權重的中間值
float weight(const float* a, float p) {
  int i = min(6, (int)p);
  return a[i] + (a[i + 1] - a[i]) * (p - i);
}

// 沒有麥克風時的假頻譜：第 b 個頻段在時間 t 的音量（0..1 左右）
float fakeBand(int b, float t) {
  const float BEAT = 2.8f / 6;                              // 一拍 0.467 秒（約 128 BPM）
  float kick  = expf(-fmodf(t, BEAT) / 0.07f);              // 大鼓：每拍，70 毫秒就退掉
  float snare = expf(-fmodf(t + BEAT, 2 * BEAT) / 0.09f);   // 小鼓：隔拍
  float hat   = expf(-fmodf(t, BEAT / 2) / 0.04f);          // 腳踏鈸：每半拍，很短
  int step = (int)floorf(t * 20) % 56;                      // 抖動每 50 毫秒換一次

  // 每個頻段 = 底 + 大鼓 + 小鼓 + 腳踏鈸 + 抖動（低頻吃大鼓、中頻吃小鼓、高頻吃腳踏鈸）；下面是 8 段的權重
  const float base[8]  = {0.35f, 0.30f, 0.30f, 0.25f, 0.25f, 0.20f, 0.15f, 0.10f};
  const float kickW[8] = {0.65f, 0.60f, 0.25f, 0.05f, 0.00f, 0.00f, 0.00f, 0.00f};
  const float snrW[8]  = {0.00f, 0.05f, 0.35f, 0.45f, 0.40f, 0.25f, 0.10f, 0.00f};
  const float hatW[8]  = {0.00f, 0.00f, 0.00f, 0.05f, 0.10f, 0.35f, 0.50f, 0.55f};
  const float jitW[8]  = {0.10f, 0.15f, 0.20f, 0.25f, 0.30f, 0.25f, 0.30f, 0.30f};
  float p = b * 7.0f / (BANDS - 1);                         // 這個頻段對到 8 段權重的哪裡
  return weight(base, p) + weight(kickW, p) * kick + weight(snrW, p) * snare + weight(hatW, p) * hat
       + weight(jitW, p) * noise01(b, step);
}

int style = 0;                // 樣式：0 長條、1 從中間往上下長、2 長條＋頂端白點
int colorMode = 0;            // 顏色：0 每個頻段一色、1 依高度變色
float level[BANDS];           // 每一欄目前顯示的高度（格）
float peak[BANDS];            // 頂端白點的高度（格）
float hold[BANDS];            // 白點還要停幾秒才開始往下掉
float lastT = 0;

// 第 b 欄的顏色：f 是這一格的高度位置（0＝最低、1＝最高），越高越亮；fill 是這格亮幾成
Color barColor(int b, float f, float fill) {
  float hue = colorMode == 0 ? b * 280.0f / (BANDS - 1)   // 每個頻段一色：低頻紅 → 高頻紫
                             : 120 - 120 * f;             // 依高度變色：下綠 → 中黃 → 上紅
  return hsv(hue, 255, (110 + 145 * f) * fill);
}

void setup() {
  begin();
  brightness(BRIGHT);        // 整面亮度（沒寫是 0.6）
}

void loop() {
  float k = knob.value();
  audio.sensitivity(k < 0.5f ? 0.15f + k * 0.7f : k);   // 旋鈕調靈敏度：最左 0.15（很不靈敏，但不關掉）、中間 0.5（一般）、最右 1
  if (button1.clicked()) style = (style + 1) % 3;        // 按一下按鈕 1：換下一種樣式
  if (button2.clicked()) colorMode = (colorMode + 1) % 2;   // 按一下按鈕 2：換顏色

  float t = seconds();
  float dt = t - lastT;                 // 距離上一格幾秒，讓落下速度與幀率無關
  if (dt < 0 || dt > 0.5f) dt = 0;
  lastT = t;

  const int MID = HEIGHT / 2;           // 「從中間往上下長」的中線
  clear();
  for (int b = 0; b < BANDS; b++) {     // 一段對一欄（BANDS 跟 WIDTH 一樣）
    float v;
    if (audio.ready()) v = audio.band(b);    // 有麥克風：這個頻段的真實音量 0..1
    else v = fakeBand(b, t);                 // 沒有麥克風：模擬鼓組
    float target = constrain(v * HEIGHT, 0.6f, (float)HEIGHT);   // 最少 0.6 格：最底下那排一直亮著

    // 瞬間衝上、快速落下（每秒掉 3 個畫面高）
    if (target > level[b]) level[b] = target;
    else level[b] = max(target, level[b] - 3.0f * HEIGHT * dt);

    // 頂端白點：被長條頂上去，停 0.3 秒再慢慢往下掉（每秒 0.75 個畫面高）
    if (level[b] >= peak[b]) { peak[b] = level[b]; hold[b] = 0.3f; }
    else if (hold[b] > 0) hold[b] -= dt;
    else peak[b] = max(level[b], peak[b] - 0.75f * HEIGHT * dt);

    if (style == 1) {                                     // 從中間往上下長：上下各長一半
      float half = level[b] / 2;
      for (int r = 0; r < MID; r++) {
        float fill = constrain(half - r, 0.0f, 1.0f);     // 最外面那格依高度部分點亮
        if (fill <= 0) break;
        Color c = barColor(b, r / (MID - 1.0f), fill);
        dot(b, MID - 1 - r, c);                           // 往上
        dot(b, MID + r, c);                               // 往下
      }
    } else {                                              // 長條：從最下面往上長
      for (int r = 0; r < HEIGHT; r++) {
        float fill = constrain(level[b] - r, 0.0f, 1.0f); // 最上面那格依高度部分點亮
        if (fill <= 0) break;
        dot(b, HEIGHT - 1 - r, barColor(b, r / (HEIGHT - 1.0f), fill));
      }
      if (style == 2 && peak[b] > 1) {                    // 頂端白點（長條在最底下時不畫）
        int top = min(HEIGHT - 1, (int)ceilf(peak[b]) - 1);   // 白點在從下面數第幾格
        dot(b, HEIGHT - 1 - top, dim(WHITE, 0.7f));
      }
    }
  }
  show();
}
