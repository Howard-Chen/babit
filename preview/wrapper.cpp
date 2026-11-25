// BatoPixel WASM 預覽包裝層
// 編譯站把學員的 .ino 補上函式原型（Arduino 編譯時會自動做的事）存成 student.cpp，這裡 #include 進來；
// 函式庫 BatoPixel.h 由學員程式自己 #include（-I 指向 firmware/BatoPixelS0，與板子共用同一份）。
// 網頁每 1/60 秒呼叫一次 bp_tick：第一次先跑 setup()，之後每次跑 loop()，與板子同一套節奏。
#include <emscripten.h>
#include "student.cpp"

// 提醒（網頁顯示成警告）：這幾種寫法預覽看起來正常，燒到板子上卻會出問題
#define BP_WARN_NO_BEGIN   1   // setup() 沒有呼叫 begin()：板子上燈板、麥克風、IMU 都沒啟動
#define BP_WARN_NO_SHOW    2   // 有一次 loop() 沒有呼叫 show()：板子上畫面不會送出，聲音與傾斜也不會更新
#define BP_WARN_MULTI_SHOW 4   // 有一次 loop() 呼叫了不只一次 show()：板子上一次 loop() 會拖好幾格
#define BP_WARN_LONG_BEEP  8   // buzzer.beep() 的秒數超過 10：單位是秒，很可能把毫秒當成秒（200＝響 200 秒）
static bool bp_setup_done = false;
static int  bp_warn_flags = 0;

extern "C" {

EMSCRIPTEN_KEEPALIVE
uint8_t* bp_framebuffer() { return (uint8_t*)bp_fb; }

EMSCRIPTEN_KEEPALIVE
void bp_tick(float t) {
  bp_set_time(t);       // seconds()／millis() 都從這個時間算
  bp_audio_analyze();   // 跟板子 show() 的順序一樣：先讀聲音、傾斜、旋鈕、按鈕，再畫下一格
  bp_tilt_poll();       // 預覽沒有 IMU：模擬左右搖擺（JS 用 bp_tilt_set 指定時改用指定值）
  bp_inputs_poll();     // 旋鈕、按鈕：工具頁的滑桿與按鈕（bp_input_set）
  bp_buzzer_poll();     // 蜂鳴器：beep() 的時間到了就停
  if (!bp_setup_done) {
    bp_setup_done = true;
    setup();
    if (!bp_begun) bp_warn_flags |= BP_WARN_NO_BEGIN;
  }
  bp_shows = 0;
  loop();
  if (bp_shows == 0) bp_warn_flags |= BP_WARN_NO_SHOW;
  else if (bp_shows > 1) bp_warn_flags |= BP_WARN_MULTI_SHOW;
}

// 到目前為止出現過的提醒（位元見上面 BP_WARN_*）
EMSCRIPTEN_KEEPALIVE
int bp_warn() { return bp_warn_flags | (bp_buzz_long ? BP_WARN_LONG_BEEP : 0); }

EMSCRIPTEN_KEEPALIVE
int bp_fps() { return BP_FPS; }

// 畫面尺寸與燈板接口（由學員程式的 #define PANEL／PORT 決定）：網頁照尺寸畫預覽、提醒尺寸不符；測試核對接口
EMSCRIPTEN_KEEPALIVE
int bp_width() { return BP_W; }

EMSCRIPTEN_KEEPALIVE
int bp_height() { return BP_H; }

EMSCRIPTEN_KEEPALIVE
int bp_pin() { return BP_PIN; }

// 燈條（學員程式的 #define STRIP 幾顆，接在另一個接口）：工具頁照顆數畫一排、每格讀內容（每顆 r、g、b 三個位元組）；
// 沒寫 STRIP 的程式顆數是 0、內容是空的。亮度是 strip.brightness() 設的 0–1（沒設定＝預設），腳位給測試核對
EMSCRIPTEN_KEEPALIVE
int bp_strip_count() { return BP_STRIP_N; }

EMSCRIPTEN_KEEPALIVE
int bp_strip_pin() { return BP_STRIP_PIN; }

#ifdef STRIP
EMSCRIPTEN_KEEPALIVE
uint8_t* bp_strip_buffer() { return (uint8_t*)bp_sfb; }

EMSCRIPTEN_KEEPALIVE
float bp_strip_brightness() { return bp_strip_bright(); }
#else
EMSCRIPTEN_KEEPALIVE
uint8_t* bp_strip_buffer() { return 0; }

EMSCRIPTEN_KEEPALIVE
float bp_strip_brightness() { return BP_BRIGHTNESS_PCT / 100.0f; }
#endif

// 燈條亮的部分的電流估算（板子限流用的 bp_strip_ma）：測試核對係數。sum＝燈條所有燈的 r＋g＋b，bri＝燈條亮度
EMSCRIPTEN_KEEPALIVE
float bp_strip_current_ma(float sum, int bri) { return bp_strip_ma(sum, bri); }

// 板子送到燈條的資料（色序、亮度、限流的調暗；板子用的 bp_strip_bytes）：測試核對。回傳一顆燈三個位元組裡的第 j 個
EMSCRIPTEN_KEEPALIVE
int bp_strip_wire(int r, int g, int b, float k, int bri, int order, int j) {
  uint8_t out[4] = {0, 0, 0, 0};
  bp_strip_bytes(rgb(r, g, b), k, bri, order, out);
  return j >= 0 && j < 3 ? out[j] : -1;
}

EMSCRIPTEN_KEEPALIVE
int bp_strip_order() { return BP_STRIP_COLOR_ORDER; }

// 畫面座標 → 燈條上的第幾顆（板子送燈用的 bp_index，見 BatoPixel.h「燈板接線」）：測試核對燈板接線
EMSCRIPTEN_KEEPALIVE
int bp_led_index(int x, int y) { return bp_index(x, y); }

// 亮度 k（0–1）在接 PD（pd＝1）或接電腦（pd＝0）時燈條實際的亮度 0–255（板子用的 bp_led_bri）：測試核對
EMSCRIPTEN_KEEPALIVE
int bp_led_level(float k, int pd) { return bp_led_bri(k, pd != 0); }

// 板子每格的電流估算與限流（預覽不限流）：測試核對係數與上限。sum＝所有燈的 r＋g＋b，bri＝燈條亮度
EMSCRIPTEN_KEEPALIVE
float bp_current_ma(float sum, int bri) { return bp_est_ma(sum, bri); }

EMSCRIPTEN_KEEPALIVE
float bp_current_k(float est, int pd) { return bp_limit_k(est, pd != 0); }

EMSCRIPTEN_KEEPALIVE
int bp_current_limit(int pd) { return pd ? BP_PD_MAX_MA : BP_USB_MAX_MA; }

// 測試與之後的滑鼠模擬傾斜：指定 tilt 的值（g），之後 tilt.ready() 也會回 true
EMSCRIPTEN_KEEPALIVE
void bp_tilt_set(float x, float y) { bp_tilt_override(x, y); }

// 工具頁的旋鈕滑桿（0–1）與四顆按鈕（1＝按著）：下一格 loop() 前換算成 pressed()／clicked()。
// 從 JavaScript 呼叫時後面的參數沒給就是 0：只給旋鈕與按鈕 1、2 的舊呼叫法照樣可以
EMSCRIPTEN_KEEPALIVE
void bp_input_set(float knob, int b1, int b2, int b3, int b4) { bp_input_override(knob, b1 != 0, b2 != 0, b3 != 0, b4 != 0); }

// 蜂鳴器現在該響的頻率（Hz，0＝沒出聲）：工具頁每格讀一次，用電腦的喇叭發聲
EMSCRIPTEN_KEEPALIVE
float bp_buzzer_hz() { return bp_buzz_hz; }

// 測試用：假裝板子上沒有蜂鳴器（0）或有（1）。板子在 begin() 時自己偵測；預覽一律當成有
EMSCRIPTEN_KEEPALIVE
void bp_buzzer_present(int ok) { bp_buzz_ok = ok != 0; }

// 板子上的固定腳位（測試核對跟 PCB 的接線表一樣）：0–3＝按鈕 1–4，4＝蜂鳴器
EMSCRIPTEN_KEEPALIVE
int bp_board_pin(int i) {
  const int pins[5] = { BP_BTN1_PIN, BP_BTN2_PIN, BP_BTN3_PIN, BP_BTN4_PIN, BP_BUZZER_PIN };
  return i >= 0 && i < 5 ? pins[i] : -1;
}

// 學員程式設的亮度（0–1）；網頁畫預覽時乘上「亮度 ÷ 預設亮度」（最多 1），調低就變暗
EMSCRIPTEN_KEEPALIVE
float bp_brightness() { return bp_bright; }

EMSCRIPTEN_KEEPALIVE
float bp_brightness_default() { return BP_BRIGHTNESS_PCT / 100.0f; }

// 測試用：目前的麥克風靈敏度倍率（audio.sensitivity() 設的）
EMSCRIPTEN_KEEPALIVE
float bp_sensitivity() { return bp_sens; }

// ── 聲音：JS 把 Web Audio 的取樣寫進暫存區，再 commit 推進環形緩衝 ──
EMSCRIPTEN_KEEPALIVE
float* bp_audio_buffer() { return bp_in; }

EMSCRIPTEN_KEEPALIVE
int bp_audio_capacity() { return BP_FFT_N; }

EMSCRIPTEN_KEEPALIVE
void bp_audio_set_rate(float r) { bp_audio_rate(r); }

EMSCRIPTEN_KEEPALIVE
void bp_audio_commit(int n) {
  if (n > BP_FFT_N) n = BP_FFT_N;
  for (int i = 0; i < n; i++) bp_audio_push(bp_in[i]);
}

// 除錯／驗證用：讓 JS 直接讀分析結果，不必透過學員程式
EMSCRIPTEN_KEEPALIVE
float bp_audio_level() { return audio.level(); }

EMSCRIPTEN_KEEPALIVE
float bp_audio_band(int i) { return audio.band(i); }

EMSCRIPTEN_KEEPALIVE
int bp_audio_beat() { return audio.beat() ? 1 : 0; }

EMSCRIPTEN_KEEPALIVE
int bp_audio_bands() { return BP_BANDS; }

// 測試用：直接指定靈敏度倍率（學員程式用 audio.sensitivity(0–1)，沒設定是 1.0）
EMSCRIPTEN_KEEPALIVE
void bp_audio_sens(float k) { bp_set_sensitivity(k); }

// 測試用：換成板子的雜訊閘與滿版參考音量，在預覽端模擬板子＋旋鈕的行為
EMSCRIPTEN_KEEPALIVE
void bp_audio_scale(float gate, float fullScale) { bp_gate = gate; bp_fs = fullScale; }

}
