// BatoPixel 函式庫（雙目標版）
// 學員的程式（完整的 .ino）長這樣，規則與可用的函式寫在 AGENTS.md：
//   #define PANEL 8            // 燈板：8（8×8）或 16（16×16）
//   #include "BatoPixel.h"
//   void setup() { begin(); }
//   void loop()  { …用 seconds() 算出這一格的畫面…; show(); }
// 同一份檔案供兩個目標編譯：
//   板子（arduino-cli／xtensa）→ Adafruit_NeoPixel 驅動 WS2812、I²S 讀麥克風、I²C 讀 IMU
//   瀏覽器預覽（emcc／WASM，__EMSCRIPTEN__）→ 純框架緩衝、由 JS 餵 Web Audio 取樣
// 畫圖、聲音分析、傾斜的換算兩端共用同一份實作，杜絕語意漂移。
#pragma once

// 學員的 PANEL、PORT 是很通用的名字：引入系統與核心的標頭檔時先收起來，免得撞到裡面同名的東西
#pragma push_macro("PANEL")
#pragma push_macro("PORT")
#undef PANEL
#undef PORT
#include <math.h>
#ifdef __EMSCRIPTEN__
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <emscripten.h>
#else
#include <Adafruit_NeoPixel.h>
#include <ESP_I2S.h>
#include <Wire.h>
#endif
#pragma pop_macro("PORT")
#pragma pop_macro("PANEL")

// ── 燈板：學員程式最前面的 #define PANEL 8 或 16 ─────────────────────────
// 寫錯時也給 BP_W 一個值，錯誤訊息只會有這一行，不會連帶冒出一堆
#if !defined(PANEL)
#error "程式最前面要寫 #define PANEL 8（8×8 燈板）或 #define PANEL 16（16×16 燈板），而且要寫在 #include 那一行的前面"
#define BP_W 8
#elif PANEL == 8 || PANEL == 16
#define BP_W PANEL
#else
#error "PANEL 只能是 8 或 16（#define PANEL 8 或 #define PANEL 16）"
#define BP_W 8
#endif
#define BP_H BP_W
#define BP_N (BP_W * BP_H)
static const int WIDTH  = BP_W;   // 學員用：畫面寬幾格
static const int HEIGHT = BP_H;   // 學員用：畫面高幾格

// ── 燈板接線：畫面座標（左上 (0,0)、x 往右、y 往下）→ 燈條上的第幾顆 ─────────
// 8×8 燈板實測：逐行（第 0 顆在左上，每列方向相同）。
// 16×16 燈板實測（2026-10-21）：第 0 顆在右上、一欄一欄往下（每欄方向相同，不是蛇行）→ 內容要逆時針轉 90° 才是正的。
// 新燈板照 README「新燈板接線測試」用 walk.ino 看第 0 顆在哪、怎麼走，再設這三個旗標。
// 可在 #include 前面用 #define 覆寫（接線測試用）。預覽也編得到這段：測試用 bp_led_index 核對（wrapper.cpp）。
#ifndef BP_ROTATE
#if BP_W == 16
#define BP_ROTATE      90   // 送出前把內容逆時針轉幾度（0、90、180、270）
#else
#define BP_ROTATE      0
#endif
#endif
#ifndef BP_TRANSPOSE
#define BP_TRANSPOSE   0    // 1＝行列互換
#endif
#ifndef BP_SERPENTINE
#define BP_SERPENTINE  0    // 1＝蛇行排列；0＝逐行排列
#endif
static inline int bp_index(int x, int y) {
  if (BP_ROTATE == 90)       { int t = x; x = y; y = BP_W - 1 - t; }   // 燈板是正方形，轉了寬高一樣
  else if (BP_ROTATE == 180) { x = BP_W - 1 - x; y = BP_H - 1 - y; }
  else if (BP_ROTATE == 270) { int t = x; x = BP_W - 1 - y; y = t; }
  if (BP_TRANSPOSE) { int t = x; x = y; y = t; }
  if (BP_SERPENTINE && (y & 1)) x = BP_W - 1 - x;
  return y * BP_W + x;                        // 旗標都是 0 時是恆等：逐行（row-major）
}

// ── 燈板接口：#define PORT B（或 C），沒寫＝A。PCB 上燈板 A／B／C＝GPIO2／3／4 ──────
#define BP_PORT_A 2
#define BP_PORT_B 3
#define BP_PORT_C 4
#define BP_PORT_a 2
#define BP_PORT_b 3
#define BP_PORT_c 4
#define BP_CAT2(a, b) a##b
#define BP_CAT(a, b) BP_CAT2(a, b)
#ifdef PORT
#define BP_PIN BP_CAT(BP_PORT_, PORT)
#else
#define BP_PIN 2
#endif
#if BP_PIN != 2 && BP_PIN != 3 && BP_PIN != 4
#error "PORT 只能是 A、B 或 C（例：#define PORT B），沒寫就是 A"
#undef BP_PIN
#define BP_PIN 2
#endif

// ── 電源上限不能在程式裡改 ─────────────────────────────────────────────
// 學員程式寫在 #include 前面，#define 會蓋掉函式庫的設定。這幾個是保護燈板、電腦 USB 孔與 PD 誘騙器的上限，
// 一律擋下（兩端都擋，按 ▶ 就看得到）。開發者要測全亮時，直接改下面「電源與限流」的數字。
#if defined(BP_USB_MAX_BRI) || defined(BP_PD_MAX_BRI) || defined(BP_USB_MAX_MA) || defined(BP_PD_MAX_MA) || defined(BP_PD_DELAY_MS)
#error "電源上限（亮度與電流）是保護燈板和電腦的設定，程式裡不能改：請刪掉 #define BP_… 那一行"
#endif

// 兩端共用的目標畫面更新率：板子的 show() 與網頁播放器都以此節流，預覽與實機的順暢度一致
#define BP_FPS 60

struct Color { uint8_t r, g, b; };

static const Color BLACK   = {0, 0, 0};
static const Color WHITE   = {255, 255, 255};
static const Color RED     = {255, 0, 0};
static const Color GREEN   = {0, 255, 0};
static const Color BLUE    = {0, 0, 255};
static const Color YELLOW  = {255, 255, 0};
static const Color CYAN    = {0, 255, 255};
static const Color MAGENTA = {255, 0, 255};
static const Color ORANGE  = {255, 120, 0};
static const Color PINK    = {255, 60, 120};

static Color bp_fb[BP_N];

static inline float bp_clampf(float v, float lo, float hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

inline Color rgb(int r, int g, int b) {
  return { (uint8_t)bp_clampf(r, 0, 255),
           (uint8_t)bp_clampf(g, 0, 255),
           (uint8_t)bp_clampf(b, 0, 255) };
}

// h 為角度（0–360，可超出自動繞回）；s、v 為 0–255
inline Color hsv(float h, float s, float v) {
  h = fmodf(h, 360.0f);
  if (h < 0) h += 360.0f;
  float S = bp_clampf(s, 0, 255) / 255.0f;
  float V = bp_clampf(v, 0, 255) / 255.0f;
  float C = V * S;
  float X = C * (1.0f - fabsf(fmodf(h / 60.0f, 2.0f) - 1.0f));
  float m = V - C;
  float r = 0, g = 0, b = 0;
  switch ((int)(h / 60.0f) % 6) {
    case 0: r = C; g = X; break;
    case 1: r = X; g = C; break;
    case 2: g = C; b = X; break;
    case 3: g = X; b = C; break;
    case 4: r = X; b = C; break;
    default: r = C; b = X; break;
  }
  return { (uint8_t)((r + m) * 255.0f),
           (uint8_t)((g + m) * 255.0f),
           (uint8_t)((b + m) * 255.0f) };
}

inline Color dim(Color c, float k) {
  k = bp_clampf(k, 0.0f, 1.0f);
  return { (uint8_t)(c.r * k), (uint8_t)(c.g * k), (uint8_t)(c.b * k) };
}

inline void clear() {
  for (int i = 0; i < BP_N; i++) bp_fb[i] = BLACK;
}

// 整面乘上衰減（殘影用）
inline void fade(float k) {
  for (int i = 0; i < BP_N; i++) bp_fb[i] = dim(bp_fb[i], k);
}

// 接受小數座標，自動取整；超出畫面自動忽略
inline void dot(float fx, float fy, Color c) {
  int x = (int)roundf(fx), y = (int)roundf(fy);
  if (x < 0 || x >= BP_W || y < 0 || y >= BP_H) return;
  bp_fb[y * BP_W + x] = c;
}

// ===================== 聲音：雙目標共用分析器 =====================
// 麥克風（INMP441）輸出的是「時域波形」——每秒上萬筆振幅，不是頻段。
// FFT 與頻段運算在這裡做，板子與瀏覽器跑同一份數學，數值才會一致。
// 平台差異只在原始取樣來源：板子 ← I²S；瀏覽器 ← Web Audio。
#define BP_FFT_N 1024        // FFT 點數，兩端相同
// 頻段數跟著燈板：8×8 是 8 段、16×16 是 16 段（頻譜一欄一段）。學員用 BANDS。
#if BP_W == 16
#define BP_BANDS 16
#else
#define BP_BANDS 8
#endif
static const int BANDS = BP_BANDS;   // 學員用：有幾個頻段，audio.band(0)～audio.band(BANDS - 1)

// 頻段以 Hz 定義（不是 bin 編號）——兩端取樣率不同時仍指向同一段頻率。
// 60–7500 Hz 對數等分，跟電子音樂節裝置同一套切法（2026-10-18）：16 段每段約半個八度，8 段是 16 段兩兩合併。
// 舊的 8 段是 60/130/260/500/950/1800/3200/5200/7500：高音兩段太窄，音樂在那裡能量少，常常比較矮。
// ⚠️ 上限須低於板子的 Nyquist（16kHz 取樣 → 8kHz），否則最高段在兩端涵蓋範圍不同。
static const float BP_BAND_HZ[BP_BANDS + 1] = {
#if BP_BANDS == 16
  60, 81, 110, 148, 200, 271, 366, 495, 669, 905, 1223, 1654, 2236, 3023, 4087, 5526, 7500
#else
  60, 110, 200, 366, 669, 1223, 2236, 4087, 7500
#endif
};

// 顯示刻度：人耳對音量是對數感受，而自然聲音的能量隨頻率遞減（約每八度 -3dB）。
// 用線性刻度直接畫，低音會吃掉整個畫面、高音永遠貼底——實測就是只有最下面一兩行會亮。
#define BP_DB_RANGE 50.0f    // 動態範圍：低於峰值這麼多 dB 即視為 0
// 頻譜傾斜補償：每往上一段補這麼多 dB。8 段實聽定 7；16 段每段跨度減半 → 3.5（總補償量一樣，同音樂節裝置）
#define BP_TILT_DB  (BP_BANDS == 16 ? 3.5f : 7.0f)
// 雜訊閘（整體音量 rms，0–1）：低於此值視為「沒有聲音」，畫面整個熄掉。
// 沒有它的話，安靜房間的環境噪音會被自動增益放大成滿版。
// 用 rms 判斷而不是用單一頻段：純音把能量集中在一個 bin，寬頻噪音卻分散到
// 幾百個 bin，兩者的「每 bin 振幅」差好幾個數量級，無法共用同一個門檻。
// 滿版參考音量（rms）：比這小聲的聲音，頻譜與音量依比例變矮，不再被自動增益撐滿；旋鈕除在這個值上。
// 沒有它的話，過了雜訊閘的聲音都會被自動增益撐滿，旋鈕轉起來只像一個開關（2026-10-14 實機回報）。
#ifdef __EMSCRIPTEN__
#define BP_GATE        0.01f   // 預覽：筆電麥克風經 Web Audio 的刻度
#define BP_FULL_SCALE  0.0f    // 預覽沒有旋鈕：只用自動增益（照舊）
#else
// 板子：INMP441 靈敏度 −26 dBFS @ 94 dB SPL → 94 dB 的聲音 rms 才約 0.05，一般音樂 70–80 dB SPL 只有 0.003–0.01，
// 用 0.01 會整段被閘門關掉（音樂節原型實測改 0.002，仍遠高於 INMP441 底噪約 0.00004）
#define BP_GATE        0.002f
#define BP_FULL_SCALE  0.02f   // 旋鈕在中間時，約 86 dB 的聲音才會滿版（一般音樂約半高，往上轉才滿）
#endif

// 兩者做成變數而非純常數：預覽端可即時調整（對著真實音樂調手感），
// 板子端維持上面的預設值。調定後把預設值改掉即可。
static float bp_db_range = BP_DB_RANGE;
static float bp_tilt_db  = BP_TILT_DB;
static float bp_gate     = BP_GATE;
static float bp_fs       = BP_FULL_SCALE;
inline void bp_audio_tune(float dbRange, float tiltDb, float gate) {
  if (dbRange > 1.0f) bp_db_range = dbRange;
  bp_tilt_db = tiltDb;
  if (gate >= 0.0f) bp_gate = gate;
}

// 靈敏度倍率：學員程式用 audio.sensitivity(k) 設定（k 0–1，例如 audio.sensitivity(knob.value()) 讓旋鈕調），
// 照音樂節原型對數映射成 1/16–16，k＝0.5 是 1.0；沒設定就是 1.0。
// 除在雜訊閘、滿版參考音量與節拍判定的固定差距上：調大＝小聲也有反應、比較小聲就滿版；調到 0＝等於關閉。
#define BP_SENS_MIN 0.0625f   // k＝0：雜訊閘 0.16、節拍差距 1.9 → 等於關閉
#define BP_SENS_MAX 16.0f     // k＝1（最靈敏）：雜訊閘 0.000625、節拍差距 0.0075
static float bp_sens = 1.0f;
inline void bp_set_sensitivity(float k) { bp_sens = k < 0.05f ? 0.05f : k; }
inline void bp_sensitivity_01(float k) {
  k = k < 0.0f ? 0.0f : (k > 1.0f ? 1.0f : k);
  bp_set_sensitivity(BP_SENS_MIN * powf(BP_SENS_MAX / BP_SENS_MIN, k));
}

// 可在 setup()／loop() 外面寫一行調整聲音處理（進階用，AGENTS.md 不提；靈敏度用 audio.sensitivity()）。
// 省略不寫就用上面的預設值。
//   AUDIO_TUNE(高頻補償, 動態範圍, 雜訊閘);
//   高頻補償 每往上一段補幾 dB（大＝高音更明顯）
//   動態範圍 低於峰值幾 dB 視為 0（大＝小聲的頻段也看得見）
//   雜訊閘   整體音量低於此值視為無聲（大＝要更大聲才有反應）
#define AUDIO_TUNE(tilt, range, gate)   static const bool bp_audio_tuned =      (bp_audio_tune((float)(range), (float)(tilt), (float)(gate)), true)

static float bp_ring[BP_FFT_N];      // 環形緩衝：最新的原始取樣
static int   bp_ring_w = 0;
static float bp_rate = 48000.0f;     // 取樣率（板子與瀏覽器不同）
static float bp_re[BP_FFT_N], bp_im[BP_FFT_N];
static float bp_bands[BP_BANDS];
static float bp_band_peak = 0.0f;   // 全域頻段峰值（單一增益，見 analyze）
static float bp_level = 0.0f;
static float bp_agc_peak = 0.01f;    // 自動增益：慢速衰減的峰值
static float bp_level_avg = 0.0f;
static bool  bp_beat = false;
static int   bp_beat_hold = 0;
static bool  bp_audio_on = false;
static int   bp_audio_idle = 0;     // 連續幾格畫面沒收到新取樣（見 analyze）

inline void bp_audio_push(float s) {
  bp_ring[bp_ring_w] = s;
  bp_ring_w = (bp_ring_w + 1) & (BP_FFT_N - 1);
  bp_audio_on = true;
  bp_audio_idle = 0;
}

inline void bp_audio_rate(float r) { if (r > 0) bp_rate = r; }

// 原地 radix-2 複數 FFT（實數輸入，虛部為 0）
static void bp_fft() {
  const int n = BP_FFT_N;
  for (int i = 1, j = 0; i < n; i++) {
    int bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      float t;
      t = bp_re[i]; bp_re[i] = bp_re[j]; bp_re[j] = t;
      t = bp_im[i]; bp_im[i] = bp_im[j]; bp_im[j] = t;
    }
  }
  for (int len = 2; len <= n; len <<= 1) {
    float ang = -6.28318530718f / (float)len;
    float wr = cosf(ang), wi = sinf(ang);
    for (int i = 0; i < n; i += len) {
      float cr = 1.0f, ci = 0.0f;
      for (int k = 0; k < len / 2; k++) {
        int a = i + k, b = i + k + len / 2;
        float vr = bp_re[b] * cr - bp_im[b] * ci;
        float vi = bp_re[b] * ci + bp_im[b] * cr;
        float ur = bp_re[a], ui = bp_im[a];
        bp_re[a] = ur + vr; bp_im[a] = ui + vi;
        bp_re[b] = ur - vr; bp_im[b] = ui - vi;
        float ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// 每格畫面呼叫一次：去直流 → Hann 視窗 → FFT → 頻段能量 → 自動增益
inline void bp_audio_analyze() {
  if (!bp_audio_on) return;
  // 超過半秒沒有新取樣（網頁上關掉麥克風或測試音）就當作沒有音源：ready() 變回 false、數值歸零。
  // 否則環形緩衝裡的舊聲音會每格被重算一次，頻譜停在最後一格，範例也回不到示意模式。
  if (++bp_audio_idle > BP_FPS / 2) {
    bp_audio_on = false;
    bp_level = 0.0f;
    bp_beat = false;
    for (int b = 0; b < BP_BANDS; b++) bp_bands[b] = 0.0f;
    for (int i = 0; i < BP_FFT_N; i++) bp_ring[i] = 0.0f;
    return;
  }

  float mean = 0.0f;
  for (int i = 0; i < BP_FFT_N; i++) mean += bp_ring[i];
  mean /= (float)BP_FFT_N;

  float sumsq = 0.0f;
  for (int i = 0; i < BP_FFT_N; i++) {
    int idx = (bp_ring_w + i) & (BP_FFT_N - 1);   // 由舊到新排好
    float v = bp_ring[idx] - mean;                // 去直流偏移
    sumsq += v * v;
    float w = 0.5f * (1.0f - cosf(6.28318530718f * (float)i / (float)(BP_FFT_N - 1)));
    bp_re[i] = v * w;
    bp_im[i] = 0.0f;
  }
  float rms = sqrtf(sumsq / (float)BP_FFT_N);

  // 音量：自動增益讓安靜與吵雜環境都能用（峰值立刻跟上、慢慢衰減）
  if (rms > bp_agc_peak) bp_agc_peak = rms;
  else bp_agc_peak += (rms - bp_agc_peak) * 0.003f;
  const float g0 = bp_gate / bp_sens;                       // 實際的雜訊閘：靈敏度倍率越大門檻越低
  const float fs = bp_fs / bp_sens;                         // 實際的滿版參考音量（0＝只用自動增益）
  float den = bp_agc_peak < g0 ? g0 : bp_agc_peak;          // 下限＝雜訊閘
  if (den < fs) den = fs;                                   // 比滿版參考音量小聲時不再撐滿
  // 閘門增益：低於門檻全關，門檻到兩倍之間平滑淡入（避免邊界閃爍）
  float gate = 1.0f;
  if (rms < g0) gate = 0.0f;
  else if (rms < g0 * 2.0f) gate = (rms - g0) / g0;
  bp_level = bp_clampf(rms / den, 0.0f, 1.0f) * gate;

  // 節拍：超過慢速平均一定幅度即觸發，並設不應期避免連發；固定差距同樣除以靈敏度倍率
  bp_beat = false;
  if (bp_beat_hold > 0) bp_beat_hold--;
  else if (bp_level > bp_level_avg * 1.4f + 0.12f / bp_sens) { bp_beat = true; bp_beat_hold = 8; }
  bp_level_avg += (bp_level - bp_level_avg) * 0.04f;

  bp_fft();
  float binHz = bp_rate / (float)BP_FFT_N;
  float raw[BP_BANDS];
  float mx = 0.0f;
  for (int b = 0; b < BP_BANDS; b++) {
    int lo = (int)(BP_BAND_HZ[b] / binHz + 0.5f);
    int hi = (int)(BP_BAND_HZ[b + 1] / binHz + 0.5f);
    if (lo < 1) lo = 1;                       // bin 0 是直流，跳過
    if (hi > BP_FFT_N / 2) hi = BP_FFT_N / 2;
    if (hi <= lo) hi = lo + 1;
    // 取段內最大值而非平均：頻段是對數分佈，高頻段涵蓋的 bin 數多很多，
    // 取平均會把窄頻訊號稀釋——實測同振幅純音在 100Hz 讀 1.00、7kHz 只剩 0.07。
    float e = 0.0f;
    for (int k = lo; k < hi; k++) {
      float mag = sqrtf(bp_re[k] * bp_re[k] + bp_im[k] * bp_im[k]);
      if (mag > e) e = mag;
    }
    raw[b] = e;
    if (e > mx) mx = e;
  }
  // 單一全域增益，不是每段各自算——每段各自 AGC 會把安靜的頻段也拉到滿格，
  // 頻譜就失去「哪一段比較大聲」的意義。
  // 閘門關閉時凍結峰值追蹤：否則它會衰減到底噪水準，
  // 下次有聲音的瞬間會被過度放大。
  if (gate > 0.0f) {
    if (mx > bp_band_peak) bp_band_peak = mx;
    else bp_band_peak += (mx - bp_band_peak) * 0.01f;
  }
  float d = bp_band_peak < 1e-6f ? 1e-6f : bp_band_peak;
  // 自動增益的上限：最近的音量（agc 峰值）還不到滿版參考音量時，整個頻譜的高度依比例變矮。
  // 直接乘在最後的 0–1 高度上：寬頻聲音的高頻段有傾斜補償，dB 上常常超出滿格好幾十 dB，在 dB 上調整看不出差別。
  // 開根號讓變化平緩：音量每小一半，頻譜約矮三成。
  float fsGain = 1.0f;
  if (fs > 0.0f && bp_agc_peak < fs) fsGain = sqrtf(bp_agc_peak / fs);
  for (int b = 0; b < BP_BANDS; b++) {
    // 相對峰值換算成 dB，再加上隨頻率遞增的傾斜補償，最後映射到 0–1，
    // 最後乘上閘門增益（沒聲音時整面熄掉）與自動增益上限。
    float db = 20.0f * log10f(raw[b] / d + 1e-9f) + bp_tilt_db * (float)b;
    bp_bands[b] = bp_clampf((db + bp_db_range) / bp_db_range, 0.0f, 1.0f) * gate * fsGain;
  }
}

// 學員用的 API
// 預覽：同一格裡聲音與傾斜不會變，「用迴圈等它們變」（while (!audio.beat())）會讓整個頁面卡死；
// 讀的次數多到不合理時中止這一格（bp_sense_read 定義在下面的預覽版底層）。板子上不計數。
#ifdef __EMSCRIPTEN__
inline void bp_sense_read();
#define BP_SENSE_READ() bp_sense_read()
#else
#define BP_SENSE_READ() ((void)0)
#endif

struct BPAudio {
  float level() const { BP_SENSE_READ(); return bp_level; }                 // 音量 0–1
  float band(int i) const { BP_SENSE_READ(); return (i < 0 || i >= BP_BANDS) ? 0.0f : bp_bands[i]; }  // 頻段能量 0–1
  bool  beat()  const { BP_SENSE_READ(); return bp_beat; }                  // 這格畫面有無節拍
  bool  ready() const { BP_SENSE_READ(); return bp_audio_on; }              // 麥克風有沒有在供料（停止半秒後變回 false）
  void  sensitivity(float k) const { bp_sensitivity_01(k); }                // 靈敏度 0–1（0.5＝一般），例如 audio.sensitivity(knob.value())
};
static BPAudio audio;

// ===================== 傾斜：tilt =====================
// 板子上的 IMU（QMI8658C）量重力方向，換算成「往畫面右邊」與「往畫面下面」兩個分量（單位 g）：
// 燈板正立時 tilt.y() 約 1、tilt.x() 約 0；右邊往下倒，x 變正。
// 沒有 IMU（預覽、或板子上沒接）時給左右搖擺的模擬值，畫面照樣會動；tilt.ready() 才代表真的有 IMU。
static float bp_tilt_x = 0.0f, bp_tilt_y = 1.0f;
static bool  bp_tilt_ok = false;       // 板子：IMU 有回應、設定好、已經出數值
static bool  bp_tilt_manual = false;   // 預覽：JS 指定的值（測試用，之後也可做滑鼠模擬傾斜）

inline void bp_tilt_simulate(float t) {
  float sway = 0.45f * sinf(6.2831853f * t / 2.8f);   // 左右各約 26°，2.8 秒一個來回
  bp_tilt_x = sinf(sway);
  bp_tilt_y = cosf(sway);
}

// 學員用的 API
struct BPTilt {
  float x() const { BP_SENSE_READ(); return bp_tilt_x; }                         // 往畫面右邊的重力（g）
  float y() const { BP_SENSE_READ(); return bp_tilt_y; }                         // 往畫面下面的重力（g），正立時約 1
  bool  ready() const { BP_SENSE_READ(); return bp_tilt_ok || bp_tilt_manual; }  // 有沒有真的在量（沒有就是模擬值）
};
static BPTilt tilt;

// ===================== 旋鈕、按鈕、亮度 =====================
// 板子上一顆旋鈕（GPIO1）、兩顆按鈕（GPIO8、GPIO9）。用來做什麼由學員程式決定，函式庫不會自己拿來做事：
//   旋鈕調亮度 brightness(knob.value())、調麥克風靈敏度 audio.sensitivity(knob.value())；
//   按鈕 1 換模式 if (button1.clicked()) mode++;、按鈕 2 換顏色 if (button2.clicked()) colorMode++;
//   （範例的慣例：旋鈕調快慢或強弱、按鈕 1 換內容、按鈕 2 換顏色；不做暫停——畫面停住會被以為壞掉）
// 預覽沒有硬體：工具頁預覽下方的旋鈕滑桿與兩顆按鈕經 bp_input_set（wrapper 匯出）傳進來。
static float bp_knob_val = 0.5f;                 // 旋鈕位置 0–1，順時針變大；沒讀到旋鈕時停在中間
static bool  bp_btn_down[2]  = {false, false};   // 現在有沒有按著
static bool  bp_btn_click[2] = {false, false};   // 這一格剛按下（按一次只有一格是 true）

// 每格畫面更新一次按鈕（板子在 show() 之後、預覽在每格 loop() 之前）：從放開變成按下＝這一格「按了一下」
inline void bp_buttons_update(bool d1, bool d2) {
  const bool d[2] = {d1, d2};
  for (int i = 0; i < 2; i++) { bp_btn_click[i] = d[i] && !bp_btn_down[i]; bp_btn_down[i] = d[i]; }
}

// 學員用的 API
struct BPKnob {
  float value() const { BP_SENSE_READ(); return bp_knob_val; }       // 旋鈕位置 0–1（順時針變大）
};
static BPKnob knob;

struct BPButton {
  int i;
  bool pressed() const { BP_SENSE_READ(); return bp_btn_down[i]; }   // 現在有沒有按著
  bool clicked() const { BP_SENSE_READ(); return bp_btn_click[i]; }  // 這一格剛按下（按一次只算一次）
};
static BPButton button1 = {0}, button2 = {1};

// 亮度 0–1：板子上再乘上當下電源的亮度上限（接電腦 20、PD 160，見板子版的「電源與限流」），調到 1 也安全。
// 沒呼叫就是 BP_BRIGHTNESS_PCT（60%，跟以前固定的亮度一樣）。預覽把這個預設值當成原本的亮度，調低才變暗。
#ifndef BP_BRIGHTNESS_PCT
#define BP_BRIGHTNESS_PCT 60
#endif
static float bp_bright = BP_BRIGHTNESS_PCT / 100.0f;
inline void brightness(float k) { bp_bright = k < 0.0f ? 0.0f : (k > 1.0f ? 1.0f : k); }

// 燈條實際亮度（0–255）：brightness() 的 0–1 乘上當下電源的亮度上限（接電腦 20、PD 160）。
// 接電腦時，程式自己調暗（比預設暗）就不再跟著壓那麼暗：最少是預設亮度接電腦時的亮度（12），也不會比接 PD 時亮。
// 這樣 16×16 範例為了 PD 調暗，接電腦時還是看得清楚；預設亮度與調亮的程式完全不受影響（2026-10-25）。
// 板子版的「電源與限流」用它；預覽不套上限，測試經 bp_led_level（wrapper.cpp）核對。
// 學員程式不能改上限（檔案開頭擋下）；先 #undef，被擋下時錯誤訊息只會有那一行
#undef BP_USB_MAX_BRI
#undef BP_PD_MAX_BRI
#define BP_USB_MAX_BRI 20     // 接電腦時的亮度上限（0–255）
#define BP_PD_MAX_BRI  160    // PD 供電時的亮度上限
inline int bp_led_bri(float k, bool pd) {
  float b = k * (pd ? BP_PD_MAX_BRI : BP_USB_MAX_BRI);
  const float usbDefault = BP_BRIGHTNESS_PCT / 100.0f * BP_USB_MAX_BRI;   // 預設亮度接電腦時是多亮（12）
  if (!pd && b < usbDefault) b = fminf(k * BP_PD_MAX_BRI, usbDefault);
  return (int)(b + 0.5f);
}

#ifdef __EMSCRIPTEN__
// ===================== 瀏覽器預覽版底層 =====================
// 亮度鎖屬硬體保護，預覽端不套用（canvas 顯示邏輯色彩）。

// ─────────────────── Arduino 相容層（只存在於預覽端）───────────────────
// 板子端這些由 Arduino 核心提供。預覽端若缺，症狀是「完全正確的 Arduino 程式
// 在預覽編譯失敗」，違反本工具「預覽＝板子」的承諾——而 AI 產生的動畫幾乎一定
// 會用到 millis／random／map／PI，學員會直接卡在第一步且看到英文編譯錯誤。
// 2026-09-10 以兩端逐項編譯清查後補上，語意一律對齊 Arduino，不自創行為。

// 時間：網頁每格把「開始執行後第幾秒」傳進來（bp_set_time），seconds()、millis()、micros() 都從它算，
// 與板子（開機後的時間）語意相同。同一格裡時間不會前進，所以「用迴圈等時間」在預覽永遠等不到、
// 整個頁面會卡死：一格裡讀時間的次數多到不合理時就中止這一格，網頁停下預覽並說明原因。
static float bp_now_s = 0.0f;
static long  bp_spin = 0;                 // 這一格讀了幾次時間
static long  bp_sense_reads = 0;          // 這一格讀了幾次聲音／傾斜
#define BP_SPIN_MAX 1000000L
// 中止這一格：丟出 JS 例外，網頁接住後停下預覽（1＝迴圈等時間、2＝show() 寫在迴圈裡、3＝迴圈等聲音、傾斜或按鈕）
inline void bp_stuck(int why) { EM_ASM({ throw new Error("babit-stuck-" + $0); }, why); }
inline void bp_set_time(float t) { bp_now_s = t; bp_spin = 0; bp_sense_reads = 0; }   // 由 wrapper 在每格 loop() 前設定
inline float bp_read_time() { if (++bp_spin > BP_SPIN_MAX) bp_stuck(1); return bp_now_s; }
inline void bp_sense_read() { if (++bp_sense_reads > BP_SPIN_MAX) bp_stuck(3); }
inline float seconds() { return bp_read_time(); }
inline unsigned long millis() { return (unsigned long)(bp_read_time() * 1000.0f); }
inline unsigned long micros() { return (unsigned long)(bp_read_time() * 1000000.0f); }
// delay()、delayMicroseconds() 在檔案最後擋下（兩端都不能用）；這裡的空實作只留給 #include 前面的程式
inline void delayMicroseconds(unsigned int) {}
inline void yield() {}

// 常數：數值與 Arduino 相同（同為 double 字面值，運算提升行為才一致）
#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif
#ifndef HALF_PI
#define HALF_PI 1.5707963267948966192313216916398
#endif
#ifndef TWO_PI
#define TWO_PI 6.283185307179586476925286766559
#endif
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define RAD_TO_DEG 57.295779513082320876798154814105
#define EULER 2.718281828459045235360287471352
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define INPUT_PULLDOWN 3       // ESP32 才有（內部下拉），板子上的 Arduino 核心有定義

// map 保持 Arduino 的整數運算（含截斷行為），只多一道除零防護：
// 除零在兩端都是壞程式，但預覽端整個模組會當掉，守住比較好除錯。
inline long map(long x, long in_min, long in_max, long out_min, long out_max) {
  if (in_max == in_min) return out_min;
  return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}
// Arduino 的 constrain／min／max／sq 是可混型別的巨集，這裡用樣板達到同效果（較安全）
template <class T, class L, class H> inline T constrain(T x, L lo, H hi) {
  return x < (T)lo ? (T)lo : (x > (T)hi ? (T)hi : x);
}
// 回傳型別用 decltype(a + b) 取共同型別，不可寫成 decltype(a < b ? a : b)：
// 兩個引數同型別時，條件運算子產生「左值」，decltype 會得到 int&，於是回傳區域參數的參考，
// 呼叫端讀到已釋放的堆疊（實測 min(7,3) 回 0）。加法一定產生純右值，才安全。
template <class A, class B> inline auto min(A a, B b) -> decltype(a + b) { return a < b ? a : b; }
template <class A, class B> inline auto max(A a, B b) -> decltype(a + b) { return a > b ? a : b; }
template <class T> inline T sq(T x) { return x * x; }
inline float radians(float deg) { return deg * (float)DEG_TO_RAD; }
inline float degrees(float rad) { return rad * (float)RAD_TO_DEG; }

// 隨機：Arduino 的 random(n) 回 0..n-1、random(a,b) 回 a..b-1
inline long random(long howbig) { return howbig <= 0 ? 0 : (long)(rand() % howbig); }
inline long random(long howsmall, long howbig) {
  return howsmall >= howbig ? howsmall : howsmall + random(howbig - howsmall);
}
// Arduino 的 randomSeed(0) 是「不動種子」，不是「用 0 當種子」，這裡照抄其行為
inline void randomSeed(unsigned long seed) { if (seed) srand((unsigned int)seed); }

// 型別
typedef uint8_t  byte;
typedef uint16_t word;
typedef bool     boolean;

// 位元操作（與 Arduino 的巨集定義相同）
#define bit(b)                (1UL << (b))
#define bitRead(value, b)     (((value) >> (b)) & 0x01)
#define bitSet(value, b)      ((value) |= (1UL << (b)))
#define bitClear(value, b)    ((value) &= ~(1UL << (b)))
#define bitWrite(value, b, x) ((x) ? bitSet(value, b) : bitClear(value, b))
#define lowByte(w)            ((uint8_t)((w) & 0xff))
#define highByte(w)           ((uint8_t)((w) >> 8))

// 腳位：預覽沒有硬體，一律空動作／回 0，讓含腳位操作的 Arduino 程式仍編得過
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int  digitalRead(int) { return 0; }
inline int  analogRead(int) { return 0; }
inline void analogWrite(int, int) {}

// 多開燈板：學員可在程式裡自己開 Adafruit_NeoPixel，接在主燈板以外的接口（例如燈板 B＝GPIO3）。
// 板子端用真的 Adafruit_NeoPixel；預覽沒有那片燈板，這裡給同名空殼讓同一段程式編得過，預覽只畫主燈板。
// 寫入一律空動作、讀回一律 0；只有 numPixels() 與 Color()（把數字打包）照實回傳。
// 注意：多開的燈板不在函式庫的亮度上限與限流裡。
typedef uint16_t neoPixelType;
#define NEO_RGB    ((0 << 6) | (0 << 4) | (1 << 2) | (2))
#define NEO_GRB    ((1 << 6) | (1 << 4) | (0 << 2) | (2))
#define NEO_RGBW   ((3 << 6) | (0 << 4) | (1 << 2) | (2))
#define NEO_GRBW   ((3 << 6) | (1 << 4) | (0 << 2) | (2))
#define NEO_KHZ800 0x0000
#define NEO_KHZ400 0x0100
struct Adafruit_NeoPixel {
  uint16_t n;
  Adafruit_NeoPixel(uint16_t count = 0, int16_t = 6, neoPixelType = NEO_GRB + NEO_KHZ800) : n(count) {}
  void begin() {}
  void show() {}
  void clear() {}
  void fill(uint32_t = 0, uint16_t = 0, uint16_t = 0) {}
  void setBrightness(uint8_t) {}
  void setPixelColor(uint16_t, uint8_t, uint8_t, uint8_t) {}
  void setPixelColor(uint16_t, uint8_t, uint8_t, uint8_t, uint8_t) {}
  void setPixelColor(uint16_t, uint32_t) {}
  uint32_t getPixelColor(uint16_t) const { return 0; }
  uint8_t  getBrightness() const { return 0; }
  uint16_t numPixels() const { return n; }
  bool     canShow() const { return true; }
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b) { return ((uint32_t)r << 16) | ((uint32_t)g << 8) | b; }
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b, uint8_t w) { return ((uint32_t)w << 24) | Color(r, g, b); }
  static uint32_t ColorHSV(uint16_t = 0, uint8_t = 255, uint8_t = 255) { return 0; }
  static uint32_t gamma32(uint32_t) { return 0; }
};

// String：Arduino String 的最小可用子集。
// 刻意用固定緩衝而非 std::string——編譯站以 emcc（非 em++）連結，不含 C++ 標準庫；
// 而且堆積配置會讓 wasm 變大、編譯變慢。8×8 動畫用到的字串都很短，63 字元夠用（超過截斷）。
#define BP_STR_CAP 64
struct String {
  char b[BP_STR_CAP];
  unsigned n;
  void assign(const char* v, unsigned len) {
    n = 0;
    if (v) while (n < len && n < BP_STR_CAP - 1 && v[n]) { b[n] = v[n]; n++; }
    b[n] = '\0';
  }
  String() { b[0] = '\0'; n = 0; }
  String(const char* v)   { assign(v, BP_STR_CAP); }
  String(char c)          { b[0] = c; b[1] = '\0'; n = 1; }
  String(int v)           { char t[24]; snprintf(t, sizeof t, "%d", v);  assign(t, BP_STR_CAP); }
  String(long v)          { char t[24]; snprintf(t, sizeof t, "%ld", v); assign(t, BP_STR_CAP); }
  String(unsigned v)      { char t[24]; snprintf(t, sizeof t, "%u", v);  assign(t, BP_STR_CAP); }
  String(double v, int digits = 2) { char t[40]; snprintf(t, sizeof t, "%.*f", digits, v); assign(t, BP_STR_CAP); }
  unsigned    length() const { return n; }
  const char* c_str()  const { return b; }
  char        charAt(unsigned i) const { return i < n ? b[i] : '\0'; }
  char        operator[](unsigned i) const { return charAt(i); }
  int         toInt()   const { return atoi(b); }
  float       toFloat() const { return (float)atof(b); }
  String substring(unsigned a) const { String r; if (a < n) r.assign(b + a, n - a); return r; }
  String substring(unsigned a, unsigned e) const { String r; if (a < n && e > a) r.assign(b + a, e - a); return r; }
  String& operator+=(const String& o) {
    unsigned i = 0;
    while (i < o.n && n < BP_STR_CAP - 1) b[n++] = o.b[i++];
    b[n] = '\0';
    return *this;
  }
  bool operator==(const String& o) const {
    if (n != o.n) return false;
    for (unsigned i = 0; i < n; i++) if (b[i] != o.b[i]) return false;
    return true;
  }
};
inline String operator+(const String& a, const String& b) { String r(a); r += b; return r; }

// Serial：預覽端把輸出送到瀏覽器主控台（emcc 的 stdout 就是 console.log），
// 學員加 Serial.println 除錯時看得到東西，而不是靜默無反應。
struct BPSerial {
  void begin(long = 115200) {}
  void end() {}
  void flush() {}
  int  available() { return 0; }
  int  read() { return -1; }
  void print(const char* v)    { ::printf("%s", v ? v : ""); }
  void print(const String& v)  { ::printf("%s", v.c_str()); }
  void print(char v)           { ::printf("%c", v); }
  void print(int v)            { ::printf("%d", v); }
  void print(unsigned v)       { ::printf("%u", v); }
  void print(long v)           { ::printf("%ld", v); }
  void print(unsigned long v)  { ::printf("%lu", v); }
  void print(double v, int digits = 2) { ::printf("%.*f", digits, v); }
  void println() { ::printf("\n"); }
  template <class T> void println(T v) { print(v); ::printf("\n"); }
  void println(double v, int digits = 2) { print(v, digits); ::printf("\n"); }
  template <class... A> void printf(const char* f, A... a) { ::printf(f, a...); }
  operator bool() const { return true; }
};
static BPSerial Serial;

// JS 把 Web Audio 的取樣寫進這個暫存區，再呼叫 commit 推進環形緩衝
static float bp_in[BP_FFT_N];

inline void bp_audio_poll() {}          // 取樣由 JS 主動推入
inline void bp_begin()      { clear(); }

// 預覽沒有 IMU：用模擬的左右搖擺；JS 用 bp_tilt_set（wrapper 匯出）指定時改用指定值
inline void bp_tilt_poll() { if (!bp_tilt_manual) bp_tilt_simulate(bp_now_s); }
inline void bp_tilt_override(float x, float y) { bp_tilt_manual = true; bp_tilt_x = x; bp_tilt_y = y; }

// 預覽沒有旋鈕、按鈕：工具頁的滑桿與按鈕經 bp_input_set 傳進來，每格 loop() 前換算「這一格剛按下」
static bool bp_in_btn[2] = {false, false};
inline void bp_input_override(float k, bool b1, bool b2) {
  bp_knob_val = k < 0.0f ? 0.0f : (k > 1.0f ? 1.0f : k);
  bp_in_btn[0] = b1; bp_in_btn[1] = b2;
}
inline void bp_inputs_poll() { bp_buttons_update(bp_in_btn[0], bp_in_btn[1]); }

// ── 學員用：begin()／show() ─────────────────────────────────────────
// 預覽沒有硬體：begin() 只清畫面；show() 不用送也不用等（網頁每 1/60 秒呼叫一次 loop()，JS 直接讀 bp_fb）。
// 兩個都記下來：wrapper 據此提醒「少了 begin()／show()」或「一次 loop() 呼叫多次 show()」（板子上都會出問題）。
// show() 在一格裡被呼叫太多次＝寫在迴圈裡，預覽會卡死，跟迴圈等時間一樣中止這一格。
static bool bp_begun = false;
static int  bp_shows = 0;                 // 這一次 loop() 呼叫了幾次 show()（wrapper 每格歸零）
#define BP_SHOWS_MAX 1000
inline void begin() { bp_begun = true; bp_begin(); }
inline void show()  { if (++bp_shows > BP_SHOWS_MAX) bp_stuck(2); }

#else
// ===================== 板子版底層 =====================
// ── 固定接線 ─────────────────────────────────────────────────────────
// 學員只在程式裡選燈板（PANEL）與接口（PORT，見檔案開頭）；以下是巴比特燈板 PCB 的固定接線與設定，
// 寫死在這裡。接線設定（BP_COLOR_ORDER，以及檔案前面「燈板接線」的 BP_ROTATE、BP_TRANSPOSE、BP_SERPENTINE）
// 仍可在 #include 前面用 #define 覆寫（燈板接線測試用）；電源上限不行（見檔案開頭）。亮度的預設值 BP_BRIGHTNESS_PCT 在上面「旋鈕、按鈕、亮度」。

// 燈板色序（固定）：8×8 燈板實測 GRB；16×16 先用同一組。燈的排列順序（bp_index）在檔案前面「燈板接線」。
#ifndef BP_COLOR_ORDER
#define BP_COLOR_ORDER NEO_GRB
#endif

// INMP441 麥克風（I²S，固定啟用）。模組的 L/R 腳接 GND＝左聲道，與下方 SLOT 設定一致。
#ifndef BP_AUDIO
#define BP_AUDIO       1    // 0＝不初始化 I²S（沒接麥克風，或腳位另有用途）
#endif
#ifndef BP_I2S_BCLK
#define BP_I2S_BCLK    5    // 模組 SCK
#endif
#ifndef BP_I2S_WS
#define BP_I2S_WS      6    // 模組 WS
#endif
#ifndef BP_I2S_DIN
#define BP_I2S_DIN     7    // 模組 SD
#endif
#define BP_I2S_RATE    16000

// QMI8658C 六軸 IMU（I²C，固定）：PCB 上 SDA→GPIO11、SCL→GPIO12；INT（GPIO13）不使用
#ifndef BP_TILT
#define BP_TILT        1    // 0＝不初始化 IMU，tilt 一律用模擬值
#endif
#ifndef BP_IMU_SDA
#define BP_IMU_SDA     11
#endif
#ifndef BP_IMU_SCL
#define BP_IMU_SCL     12
#endif
// IMU 的哪一軸指向畫面右邊、下面（0＝X、1＝Y、2＝Z）與正負號。PCB 上的 IMU 只有 Y 軸跟麵包板時相反：
// 2026-10-14 PCB 實測「水在上面、轉動方向也反」，兩個現象都是 Y 軸反了造成的，當時誤判成整個轉了 180°、X 也改成 -1；
// 2026-10-16 實測上下對了、轉動方向仍反 → X 改回 1
#ifndef BP_TILT_X_AXIS
#define BP_TILT_X_AXIS 0
#endif
#ifndef BP_TILT_X_SIGN
#define BP_TILT_X_SIGN 1
#endif
#ifndef BP_TILT_Y_AXIS
#define BP_TILT_Y_AXIS 1
#endif
#ifndef BP_TILT_Y_SIGN
#define BP_TILT_Y_SIGN -1
#endif

// 旋鈕（PCB 上的 RV1 B10K）：中間腳 GPIO1（ADC1_CH0），兩端直接接 GND／3V3，順時針電壓變高。
// 學員程式用 knob.value() 讀（0–1）。讀值平滑、加死區（ADC 雜訊不會讓數值一直抖），兩端貼齊 0 與 1；沒讀到旋鈕時停在 0.5。
#ifndef BP_KNOB
#define BP_KNOB        1    // 0＝不讀旋鈕，knob.value() 固定 0.5
#endif
#ifndef BP_KNOB_PIN
#define BP_KNOB_PIN    1
#endif
#ifndef BP_KNOB_INVERT
#define BP_KNOB_INVERT 0    // 1＝反過來（逆時針變大）；旋鈕方向反了就改這個
#endif
#define BP_KNOB_DEADBAND 0.02f     // 讀值變化小於此比例不更新（ADC 雜訊）

// 按鈕：按下接 GND，用晶片內部上拉（PCB 接線表 2026-10-04）。學員程式用 button1／button2 的 pressed()、clicked()。
#ifndef BP_BTN1_PIN
#define BP_BTN1_PIN    8
#endif
#ifndef BP_BTN2_PIN
#define BP_BTN2_PIN    9
#endif

// 電源與限流：USB 那一端有電腦在通訊＝接電腦（安全模式）；連續 BP_PD_DELAY_MS 都沒有電腦＝PD 供電。
// 燈條亮度＝bp_led_bri()（brightness() 的 0–1 × 當下的亮度上限，見上面「旋鈕、按鈕、亮度」）。每格畫面估算電流，超過上限就整張等比調暗（只影響燈條輸出）。
// 學員程式不能覆寫（檔案開頭擋下）；先 #undef，被擋下時錯誤訊息只會有那一行
#undef BP_USB_MAX_MA
#undef BP_PD_MAX_MA
#undef BP_PD_DELAY_MS
#define BP_USB_MAX_MA  500    // 接電腦時的電流上限（mA）：電腦的 USB-A 孔只給得起 500 mA
#define BP_PD_MAX_MA   2500   // PD 供電時的電流上限（mA）：5V/3A 誘騙器留 0.5 A 餘量
#define BP_PD_DELAY_MS 2000   // 開機或拔掉電腦後，連續多久沒有電腦才當成 PD 供電

// 腳位衝突在編譯期就擋下：I²S、I²C 會把腳位接管走，燈板就不會亮
#if BP_AUDIO && (BP_PIN == BP_I2S_BCLK || BP_PIN == BP_I2S_WS || BP_PIN == BP_I2S_DIN)
#error "燈板腳位與麥克風 I2S 腳位衝突"
#endif
#if BP_AUDIO && (BP_I2S_BCLK == BP_I2S_WS || BP_I2S_BCLK == BP_I2S_DIN || BP_I2S_WS == BP_I2S_DIN)
#error "麥克風 I2S 的三支腳位不能重複"
#endif
#if BP_TILT && (BP_PIN == BP_IMU_SDA || BP_PIN == BP_IMU_SCL)
#error "燈板腳位與 IMU 的 I2C 腳位衝突"
#endif
#if BP_KNOB && BP_PIN == BP_KNOB_PIN
#error "燈板腳位與旋鈕腳位衝突"
#endif
#if BP_PIN == BP_BTN1_PIN || BP_PIN == BP_BTN2_PIN
#error "燈板腳位與按鈕腳位衝突"
#endif

static Adafruit_NeoPixel bp_strip(BP_N, BP_PIN, BP_COLOR_ORDER + NEO_KHZ800);
static I2SClass bp_i2s;
static bool bp_i2s_ok = false;

// ── 電源與限流 ───────────────────────────────────────────────────────
static bool     bp_on_pd = false, bp_no_host = false;
static uint32_t bp_no_host_ms = 0;
static uint8_t  bp_bri = 0;                  // 燈條目前的亮度（0–255）

// USB 那一端有沒有電腦：電腦每毫秒會送一個 USB 訊框，行動電源與 PD 誘騙器不會
inline bool bp_host_present() {
#if SOC_USB_SERIAL_JTAG_SUPPORTED
  return HWCDC::isPlugged();
#else
  return true;                               // 判斷不了就當作接電腦（安全模式）
#endif
}

// 有電腦就立刻回安全模式；連續 BP_PD_DELAY_MS 都沒有電腦才換成 PD 的上限
inline void bp_power_update() {
  if (bp_host_present()) { bp_on_pd = false; bp_no_host = false; }
  else if (!bp_no_host) { bp_no_host = true; bp_no_host_ms = millis(); }
  else if (millis() - bp_no_host_ms >= BP_PD_DELAY_MS) bp_on_pd = true;
  uint8_t bri = (uint8_t)bp_led_bri(bp_bright, bp_on_pd);  // bp_bright 由 brightness() 限制在 0–1
  if (bri != bp_bri) { bp_strip.setBrightness(bri); bp_bri = bri; }
}

inline void bp_show() {
  bp_power_update();
  // 估算這格畫面的電流：每色全亮約 20 mA，乘上亮度；每顆燈待機約 1 mA。超過上限就整張等比調暗
  float sum = 0;
  for (int i = 0; i < BP_N; i++) sum += bp_fb[i].r + bp_fb[i].g + bp_fb[i].b;
  float idle = BP_N * 1.0f, limit = bp_on_pd ? BP_PD_MAX_MA : BP_USB_MAX_MA;
  float est = sum / 255.0f * 20.0f * bp_bri / 255.0f + idle;
  float k = est > limit ? (limit - idle) / (est - idle) : 1.0f;
  for (int y = 0; y < BP_H; y++)
    for (int x = 0; x < BP_W; x++) {
      Color c = bp_fb[y * BP_W + x];
      if (k < 1.0f) c = dim(c, k);           // 只調輸出、不改 bp_fb（學員的 fade() 還要讀它）
      bp_strip.setPixelColor(bp_index(x, y), bp_strip.Color(c.r, c.g, c.b));
    }
  bp_strip.show();
}

// 每格畫面把 I²S DMA 裡的新資料搬進環形緩衝。
// INMP441 是 24-bit 左對齊在 32-bit 槽裡 → 右移 8 位取回 24-bit，再除以 2^23。
inline void bp_audio_poll() {
  if (!BP_AUDIO || !bp_i2s_ok) return;
  static int32_t buf[256];                       // 16kHz 下約 16ms，剛好一格畫面
  size_t got = bp_i2s.readBytes((char *)buf, sizeof(buf));
  int n = (int)(got / sizeof(int32_t));
  for (int i = 0; i < n; i++)
    bp_audio_push((float)(buf[i] >> 8) / 8388608.0f);
}

// ── IMU（QMI8658C）─────────────────────────────────────────────────
// 初始化照 2026-10-05 麵包板實測（技術_IMU沙漏測試 v2）：軟體重置後寫入設定並讀回確認、
// 等感測器真的出數值才用（設定好之後約 0.13 秒內讀到的都是 0）、每秒確認設定還在。
static uint8_t  bp_imu_addr = 0;
static bool     bp_imu_cfg = false, bp_imu_live = false;
static uint32_t bp_imu_check_ms = 0;

inline void bp_imu_write(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(bp_imu_addr);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

inline bool bp_imu_read(uint8_t reg, uint8_t* buf, int n) {
  Wire.beginTransmission(bp_imu_addr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint16_t)bp_imu_addr, (size_t)n, true) != (size_t)n) return false;
  for (int i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

// 冷開機時晶片可能還在重置，寫進去的值會被蓋掉，所以讀回確認、最多試 3 次
inline bool bp_imu_config() {
  for (int k = 0; k < 3; k++) {
    bp_imu_write(0x60, 0xB0);                  // 軟體重置，等 0x4D 出現 0x80（讀不到或讀到 0xFF 都不算）
    uint32_t t0 = millis();
    delay(15);
    uint8_t r = 0;
    while (millis() - t0 < 100) {
      if (bp_imu_read(0x4D, &r, 1) && r != 0xFF && (r & 0x80)) break;
      delay(5);
    }
    delay(10);
    bp_imu_write(0x02, 0x40);   // CTRL1：位址自動遞增、低位元組在前
    bp_imu_write(0x03, 0x16);   // CTRL2：加速度 ±4g、112 Hz
    bp_imu_write(0x04, 0x56);   // CTRL3：陀螺儀 ±512 dps、112 Hz
    bp_imu_write(0x08, 0x03);   // CTRL7：開加速度與陀螺儀
    uint8_t c1 = 0, c2 = 0, c7 = 0;
    if (bp_imu_read(0x02, &c1, 1) && bp_imu_read(0x03, &c2, 1) && bp_imu_read(0x08, &c7, 1) &&
        (c1 & 0x41) == 0x40 && c2 == 0x16 && (c7 & 0x03) == 0x03) return true;
    delay(50);
  }
  return false;
}

inline void bp_tilt_begin() {
#if BP_TILT
  Wire.begin(BP_IMU_SDA, BP_IMU_SCL, 400000);
  const uint8_t addrs[2] = {0x6B, 0x6A};       // 模組的 AD0 沒接時是 0x6B
  for (uint8_t a : addrs) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { bp_imu_addr = a; break; }
  }
  if (!bp_imu_addr) return;                    // 沒接 IMU：tilt 用模擬值，不擋開機
  uint8_t id = 0;
  if (!bp_imu_read(0x00, &id, 1) || id != 0x05) { bp_imu_addr = 0; return; }   // WHO_AM_I 不是 QMI8658
  bp_imu_cfg = bp_imu_config();
  bp_imu_check_ms = millis();
#endif
}

inline void bp_tilt_poll() {
#if BP_TILT
  if (bp_imu_addr && bp_imu_cfg) {
    uint8_t b[6];
    if (bp_imu_read(0x35, b, 6)) {               // 加速度 XYZ，低位元組在前
      float a[3];
      for (int i = 0; i < 3; i++) a[i] = (int16_t)(b[2 * i + 1] << 8 | b[2 * i]) * (4.0f / 32768);
      if (sqrtf(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) > 0.3f) bp_imu_live = true;
      if (bp_imu_live) {
        // 加速度計靜止時量到的是「向上」1g，重力是它的反方向
        bp_tilt_x = -BP_TILT_X_SIGN * a[BP_TILT_X_AXIS];
        bp_tilt_y = -BP_TILT_Y_SIGN * a[BP_TILT_Y_AXIS];
      }
    }
  }
  if (bp_imu_addr && millis() - bp_imu_check_ms >= 1000) {   // 每秒確認設定還在；不見了代表 IMU 被重置過
    bp_imu_check_ms = millis();
    uint8_t c7 = 0;
    if (!bp_imu_cfg || (bp_imu_read(0x08, &c7, 1) && (c7 & 0x03) != 0x03)) {
      bp_imu_live = false;
      bp_imu_cfg = bp_imu_config();
    }
  }
  bp_tilt_ok = bp_imu_addr && bp_imu_cfg && bp_imu_live;
#endif
  if (!bp_tilt_ok) bp_tilt_simulate(millis() / 1000.0f);
}

// ── 旋鈕 ───────────────────────────────────────────────────────────
// 舊板子可能沒焊旋鈕：沒裝時 GPIO1 浮接、讀值亂跳。先用內部上拉、下拉各讀一次——
// 浮接的腳會跟著上拉讀到 HIGH、跟著下拉讀到 LOW；裝了旋鈕由旋鈕決定電位，兩次讀到一樣。
// 旋鈕剛好停在讀值的交界附近時可能誤判成沒裝，所以沒裝的狀態每秒再判斷一次，轉一下就接上。
static bool     bp_knob_on = false;
static float    bp_knob_pos = 0.5f;          // 平滑後的旋鈕位置 0–1（knob.value() 是再加上死區的 bp_knob_val）
static uint32_t bp_knob_check_ms = 0;

static bool bp_knob_detect() {
  pinMode(BP_KNOB_PIN, INPUT_PULLUP);
  delayMicroseconds(300);
  int up = digitalRead(BP_KNOB_PIN);
  pinMode(BP_KNOB_PIN, INPUT_PULLDOWN);
  delayMicroseconds(300);
  int dn = digitalRead(BP_KNOB_PIN);
  pinMode(BP_KNOB_PIN, INPUT);
  return !(up == HIGH && dn == LOW);
}

static float bp_knob_read() {
  float raw = analogRead(BP_KNOB_PIN) / 4095.0f;
  return BP_KNOB_INVERT ? 1.0f - raw : raw;
}

static void bp_knob_attach() {
  bp_knob_on = true;
  analogReadResolution(12);
  bp_knob_pos = bp_knob_val = bp_knob_read();
  if (Serial) Serial.println("[knob] 有接旋鈕");
}

inline void bp_knob_begin() {
#if BP_KNOB
  bp_knob_check_ms = millis();
  if (bp_knob_detect()) bp_knob_attach();
  else if (Serial) Serial.println("[knob] 沒接旋鈕，knob.value() 固定 0.5");
#endif
}

inline void bp_knob_poll() {
#if BP_KNOB
  if (!bp_knob_on) {
    if (millis() - bp_knob_check_ms < 1000) return;
    bp_knob_check_ms = millis();
    if (!bp_knob_detect()) return;
    bp_knob_attach();
  }
  bp_knob_pos += (bp_knob_read() - bp_knob_pos) * 0.1f;                       // 平滑
  if (bp_knob_pos < BP_KNOB_DEADBAND) bp_knob_val = 0.0f;                      // 轉到底就是 0、轉到頂就是 1
  else if (bp_knob_pos > 1.0f - BP_KNOB_DEADBAND) bp_knob_val = 1.0f;
  else if (fabsf(bp_knob_pos - bp_knob_val) >= BP_KNOB_DEADBAND) bp_knob_val = bp_knob_pos;   // 死區
#endif
}

// ── 按鈕 ───────────────────────────────────────────────────────────
// 每格畫面讀一次（約 17 ms）。按鈕接觸的瞬間會彈跳幾毫秒：連續兩格讀到一樣才算數，按一次就不會被算成兩次。
static bool bp_btn_raw[2] = {false, false};    // 上一格讀到的原始狀態

inline void bp_buttons_begin() {
  pinMode(BP_BTN1_PIN, INPUT_PULLUP);
  pinMode(BP_BTN2_PIN, INPUT_PULLUP);
  delayMicroseconds(50);
  bp_btn_raw[0] = bp_btn_down[0] = digitalRead(BP_BTN1_PIN) == LOW;    // 開機時按著不算「按了一下」
  bp_btn_raw[1] = bp_btn_down[1] = digitalRead(BP_BTN2_PIN) == LOW;
}

inline void bp_buttons_poll() {
  const bool raw[2] = { digitalRead(BP_BTN1_PIN) == LOW, digitalRead(BP_BTN2_PIN) == LOW };
  bool d[2];
  for (int i = 0; i < 2; i++) { d[i] = raw[i] == bp_btn_raw[i] ? raw[i] : bp_btn_down[i]; bp_btn_raw[i] = raw[i]; }
  bp_buttons_update(d[0], d[1]);
}

inline void bp_begin() {
  bp_strip.begin();
  bp_power_update();       // 開機一律先用接電腦的亮度上限；沒有電腦要等 BP_PD_DELAY_MS 才放寬
  clear();
  bp_show();

#if BP_AUDIO
  // 麥克風沒接也要能正常跑動畫，所以失敗只是關掉聲音功能、不擋開機
  bp_i2s.setPins(BP_I2S_BCLK, BP_I2S_WS, -1, BP_I2S_DIN, -1);
  bp_i2s_ok = bp_i2s.begin(I2S_MODE_STD, BP_I2S_RATE,
                           I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO);
  if (bp_i2s_ok) bp_audio_rate((float)BP_I2S_RATE);
#endif
  bp_tilt_begin();         // 沒接 IMU 也能正常開機，tilt 改用模擬值
  bp_knob_begin();         // 沒裝旋鈕也能正常開機，knob.value() 固定 0.5
  bp_buttons_begin();
}

// ── 學員用：begin()／show()／seconds() ─────────────────────────────────
// 每一格的節奏：loop() 畫好 → show() 送出畫面、等到下一格的時間、讀聲音／傾斜／旋鈕／按鈕 → 下一次 loop()
static uint32_t bp_frame_ms = 0;          // 這一格從什麼時候開始算

inline void bp_sense() {
  bp_audio_poll();      // 從 I²S 收原始波形
  bp_audio_analyze();   // 兩端共用：算 level／band／beat
  bp_tilt_poll();       // 傾斜：讀 IMU；沒接 IMU 時用模擬的左右搖擺
  bp_knob_poll();       // 旋鈕：knob.value()
  bp_buttons_poll();    // 按鈕：button1／button2 的 pressed()、clicked()
}

inline float seconds() { return millis() / 1000.0f; }

inline void begin() {
  Serial.begin(115200);
#if ARDUINO_USB_CDC_ON_BOOT && ARDUINO_USB_MODE
  // 板子的 Serial 是晶片內建的 USB 序列埠：接著電腦、但沒有程式在讀時（工具頁沒開除錯模式），
  // 預設每次 print 都會等一下才放棄，動畫就會頓。改成不等：沒人讀的文字直接丟掉
  Serial.setTxTimeoutMs(0);
#endif
  bp_begin();           // 內含亮度上限與限流、麥克風、IMU、旋鈕、按鈕的初始化
  bp_sense();
  bp_frame_ms = millis();
}

inline void show() {
  bp_show();
  const uint32_t budget = 1000 / BP_FPS;   // 跟網頁預覽一樣每秒 BP_FPS 格
  uint32_t used = millis() - bp_frame_ms;
  if (used < budget) delay(budget - used);
  bp_frame_ms = millis();
  bp_sense();
}
#endif

// ── 不能用 delay() ─────────────────────────────────────────────────────
// 動畫要用 seconds() 算出「現在這一格」該畫什麼。delay() 在板子上會讓聲音、傾斜、旋鈕、按鈕停止更新，
// 在預覽又沒辦法真的停下來等，兩邊會不一樣——所以編譯時就擋下來，錯誤訊息直接說怎麼改（學員貼給 AI）。
// 放在檔案最後：上面函式庫自己用到的 delay()（IMU 初始化、show() 的等待）不受影響。
#define delay(ms) static_assert(sizeof(ms) == 0, "不能用 delay()：動畫請用 seconds() 算出現在這一格該畫什麼（見 AGENTS.md）")
// delayMicroseconds() 同理（擋 delay() 之後，AI 最常換成它；在預覽是空的、板子上卻真的會停）
#define delayMicroseconds(us) static_assert(sizeof(us) == 0, "不能用 delayMicroseconds()：動畫請用 seconds() 算出現在這一格該畫什麼（見 AGENTS.md）")
