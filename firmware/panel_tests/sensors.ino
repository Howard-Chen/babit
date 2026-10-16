// 感應器檢查
// @desc 除錯模式用：每 0.2 秒用序列埠印出旋鈕、按鈕、傾斜、聲音的數值；燈板上也畫出來
// 工具頁按「🔧 除錯模式」會載入這支程式（第一行的 PANEL 換成目前的燈板尺寸），燒錄後右邊的文字視窗顯示每一行。
// 燈板上：最上面兩排＝旋鈕位置（綠），第三排＝旋鈕的腳有沒有接好（綠＝接好、紅＝浮接、黃＝旋鈕在中段看不準），
//         第四排＝音量（橘，有拍時閃白），最下面左右兩塊＝按鈕 1、2（按著變白），青色的點＝往下的方向（傾斜）。
// 預覽沒有實體的感應器：旋鈕、按鈕用預覽下方的滑桿和按鈕，傾斜是模擬的左右搖擺，原始讀值是 0。
#define PANEL 8
#include "BatoPixel.h"

int clicks1 = 0, clicks2 = 0;          // 兩顆按鈕各按過幾次
int beats = 0;                         // 這 0.2 秒裡有幾拍
float lo = 1, hi = 0;                  // 這 0.2 秒裡旋鈕原始讀值的最小、最大（0–1）
float nextPrint = 0, nextProbe = 0;    // 下一次印一行、下一次檢查旋鈕腳位的時間
int knobPin = 0;                       // 旋鈕中間腳：0＝還沒檢查、1＝接好、2＝浮接、3＝看不準

// 旋鈕中間腳接 GPIO1：用晶片內部上拉、下拉各讀一次（跟函式庫判斷有沒有裝旋鈕的方法一樣）。
// 腳沒接到旋鈕（浮接）會跟著上拉讀到 HIGH、跟著下拉讀到 LOW；接好的話由旋鈕決定電位，兩次讀到一樣。
// 但旋鈕轉在中段時電位剛好在 HIGH／LOW 的交界附近，接好也可能這樣讀到——所以原始讀值靠近兩端才說「浮接」，中段只說「看不準」
int probeKnobPin(float raw) {
  pinMode(1, INPUT_PULLUP);
  int up = digitalRead(1);
  pinMode(1, INPUT_PULLDOWN);
  int dn = digitalRead(1);
  pinMode(1, INPUT);
  if (!(up == HIGH && dn == LOW)) return 1;
  return (raw < 0.15f || raw > 0.85f) ? 2 : 3;
}

void setup() {
  begin();
}

void loop() {
  float t = seconds();
  if (button1.clicked()) clicks1++;
  if (button2.clicked()) clicks2++;
  if (audio.beat()) beats++;
  float raw = analogRead(1) / 4095.0f;  // 旋鈕的原始讀值：0＝0 V、1＝3.3 V
  if (raw < lo) lo = raw;
  if (raw > hi) hi = raw;

  if (t >= nextProbe) { knobPin = probeKnobPin(raw); nextProbe = t + 2; }
  if (t >= nextPrint) {
#ifdef __EMSCRIPTEN__
    const char* pin = "（預覽沒有硬體）";
#else
    const char* pin = knobPin == 2 ? "浮接（中間腳沒接到 GPIO1，檢查焊點）"
                    : knobPin == 3 ? "看不準（轉到最左或最右再看）" : "接好";
#endif
    Serial.printf("旋鈕 %.2f（原始 %4d，跳動 %4d）｜按鈕1 %s（按過 %d 次）｜按鈕2 %s（按過 %d 次）｜"
                  "傾斜 x%+.2f y%+.2f（%s）｜聲音 %.2f%s（%s）｜旋鈕腳位：%s\n",
                  knob.value(), (int)(raw * 4095), (int)((hi - lo) * 4095),
                  button1.pressed() ? "按著" : "放開", clicks1, button2.pressed() ? "按著" : "放開", clicks2,
                  tilt.x(), tilt.y(), tilt.ready() ? "IMU 有" : "沒有 IMU，模擬值",
                  audio.level(), beats > 0 ? " 有拍" : "", audio.ready() ? "麥克風有" : "麥克風沒收到",
                  pin);
    lo = 1; hi = 0; beats = 0;
    nextPrint = t + 0.2f;
  }

  clear();
  for (int x = 0; x < knob.value() * WIDTH; x++) { dot(x, 0, GREEN); dot(x, 1, GREEN); }    // 旋鈕位置
  for (int x = 0; x < WIDTH; x++)
    dot(x, 2, knobPin == 2 ? RED : knobPin == 1 ? dim(GREEN, 0.3f) : knobPin == 3 ? dim(YELLOW, 0.3f) : BLACK);
  for (int x = 0; x < audio.level() * WIDTH; x++) dot(x, 3, audio.beat() ? WHITE : ORANGE);  // 音量
  for (int y = HEIGHT - 2; y < HEIGHT; y++)
    for (int x = 0; x < 2; x++) {
      dot(x, y, button1.pressed() ? WHITE : dim(BLUE, 0.4f));                    // 按鈕 1：左下
      dot(WIDTH - 1 - x, y, button2.pressed() ? WHITE : dim(BLUE, 0.4f));        // 按鈕 2：右下
    }
  dot((WIDTH - 1) / 2.0f + tilt.x() * (WIDTH / 2 - 1),                           // 傾斜：往下的方向
      (HEIGHT - 1) / 2.0f + tilt.y() * (HEIGHT / 2 - 1), CYAN);
  show();
}
