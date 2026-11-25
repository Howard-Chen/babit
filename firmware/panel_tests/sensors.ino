// 零件檢查
// @desc 除錯模式用：燈板分成幾塊，一塊檢查一個零件（按鈕、旋鈕、麥克風、蜂鳴器、傾斜），試過沒問題就變綠
// 工具頁按「🔧 除錯模式」會載入這支程式（PANEL 換成目前的燈板尺寸；原本的程式有寫 #define PORT 的話一起帶過來）。
// 第一、二版的板子（下緣沒有按鈕、沒有蜂鳴器）：把下面的 OLD_BOARD 改成 1 再燒，就只檢查它有的零件（按鈕 1、2、旋鈕、麥克風、傾斜）。
// 預設當成第三版：沒偵測到蜂鳴器就是沒過關，不會自己猜「這塊是舊板子」（蜂鳴器沒焊好的第三版看起來一模一樣）。
// 燒進板子後把每個零件都試一次：
//   四個角落＝按鈕 1–4（亮點的數目＝第幾顆）：各按一下，會嗶一聲
//   橫的長條＝旋鈕：從最左轉到最右
//   中間左＝麥克風：先安靜、再拍手（或按按鈕讓蜂鳴器響）
//   正中間＝蜂鳴器：按按鈕的時候會響（有沒有聲音要用耳朵聽）
//   中間右＝傾斜：把板子往四個邊各斜一下，白點會像彈珠一樣滾到低的那一邊，四個邊都要滾到
// 顏色：暗的＝還沒試，綠色＝過關，紅色一閃一閃＝偵測到沒接好，白色＝正按著（或正在響）。全部過關會整面放彩虹。
// 麥克風沒焊好時讀到的不是一直沒聲音、就是一直滿格：板子上超過 20 秒都沒聲音、或超過 10 秒一直滿格，那一塊也閃紅。
// 開機先整面亮紅、綠、藍、白各 0.4 秒：燈板上有不亮的燈、顏色不對，這時候看得出來。
// 文字（工具頁右邊的視窗）：每半秒印一行現況（工具頁畫成上面那排「零件清單」），哪一項過關、哪裡沒接好也會印。
// 一格畫面印的字不超過 250 位元組：板子的 USB 序列埠一次塞太多會丟字。
#define PANEL 8
#define OLD_BOARD 0                      // 第一、二版的板子（下緣沒有按鈕、沒有蜂鳴器）：改成 1 再燒
#include "BatoPixel.h"

#ifdef __EMSCRIPTEN__
#define ON_BOARD 0                       // 在工具頁的預覽裡跑
#else
#define ON_BOARD 1                       // 在板子上跑
#endif
#if !BP_BTN4_ON                          // 燈板接在 C 接口：只有第一、二版的板子有 C 接口，不用改 OLD_BOARD 也當成舊板子
#undef OLD_BOARD
#define OLD_BOARD 1
#endif
const int NBTN = OLD_BOARD ? 2 : 4;      // 這塊板子有幾顆按鈕
const bool HAS_BUZZ = !OLD_BOARD;        // 這塊板子有沒有蜂鳴器

struct Box { int x, y, w, h; };          // 一塊：左上角的位置與寬、高（格）
#if PANEL == 16
const Box btnBox[4] = {{0, 0, 7, 3}, {9, 0, 7, 3}, {0, 13, 7, 3}, {9, 13, 7, 3}};
const Box knobBox = {0, 4, 16, 2}, micBox = {0, 7, 6, 5}, buzzBox = {7, 7, 2, 5}, tiltBox = {10, 7, 6, 5};
#else
const Box btnBox[4] = {{0, 0, 3, 2}, {5, 0, 3, 2}, {0, 6, 3, 2}, {5, 6, 3, 2}};
const Box knobBox = {0, 2, 8, 1}, micBox = {0, 3, 3, 3}, buzzBox = {3, 3, 2, 2}, tiltBox = {5, 3, 3, 3};
#endif

const int NOTES[4] = {NOTE_C7, NOTE_D7, NOTE_E7, NOTE_G7};   // 四顆按鈕各一個音（這顆蜂鳴器 2000–3000 Hz 最大聲）
const int FANFARE[4] = {NOTE_C7, NOTE_E7, NOTE_G7, NOTE_C8}; // 全部過關的音樂
const Color LIT_OK = {100, 255, 100};                        // 過關之後亮的部分用的淺綠
const float UNTESTED = 0.5f;                                 // 還沒試的那一塊：自己的顏色調暗到多少（接電腦時燈很暗，再暗會分不出顏色）
const float STUCK_S = 3.0f;                                  // 按鈕連續按著超過這麼久：當成卡住（或焊錫連在一起）
const float MIC_SILENT_S = 20.0f;                            // 板子的麥克風這麼久都沒聽到聲音：標成有問題（拍手有反應就收起來）
const float MIC_FULL_S = 10.0f;                              // 板子的麥克風這麼久都是滿格：標成有問題

bool okBtn[4] = {false, false, false, false};                // 每一項過關了沒
bool okKnob = false, okMic = false, okTilt = false, okBuzz = false, allOk = false;
bool knobLo = false, knobHi = false;                         // 旋鈕轉到過最左、最右
bool tiltDir[4] = {false, false, false, false};              // 傾斜到過：左、右、上、下
bool beeped = false;                                         // 叫蜂鳴器響過了
float heldFrom[4] = {-1, -1, -1, -1};                        // 每顆按鈕從第幾秒開始按著（-1＝沒按）
bool stuck[4] = {false, false, false, false};                // 這顆按鈕一直是按著的
int micProblem = 0;                                          // 板子的麥克風：0＝沒問題、1＝沒有啟動、2＝一直沒聽到聲音、3＝一直滿格
float micLo = 1, micHi = 0, micFrom = -1;                    // 音量出現過的最小、最大；從第幾秒開始收到聲音
float rawLo = 1, rawHi = 0;                                  // 這半秒裡旋鈕原始讀值的最小、最大（0–1）
int knobPin = 0;                                             // 旋鈕中間腳：0＝還沒檢查、1＝接好、2＝沒接好、3＝看不準
float nextPrint = 0, nextProbe = 0;                          // 下一次印現況、檢查旋鈕腳位的時間
float nextLegend = 1.6f, nextTodo = 1.6f;                    // 下一次印說明、印「哪裡沒接好＋還沒過的」的時間
int legendStep = 0, todoStep = 0;                            // 說明、「還沒過」各有好幾行，一格印一行：現在印到第幾行（0＝沒有在印）
int lastDone = 0;                                            // 上一格過關了幾項（有變就馬上印新的「還沒過」）
float partyUntil = -1;                                       // 慶祝到第幾秒
int fanfareAt = 4;                                           // 過關音樂唱到第幾個音（4＝沒有在唱）
bool printed = false;                                        // 這一格已經印過一段了

bool pressed(int i) { return i == 0 ? button1.pressed() : i == 1 ? button2.pressed() : i == 2 ? button3.pressed() : button4.pressed(); }
bool clicked(int i) { return i == 0 ? button1.clicked() : i == 1 ? button2.clicked() : i == 2 ? button3.clicked() : button4.clicked(); }
const char* mark(bool ok, bool bad) { return bad ? "✗" : ok ? "✓" : "…"; }

// 旋鈕中間腳接 GPIO1：用晶片內部上拉、下拉各讀一次（跟函式庫判斷有沒有裝旋鈕的方法一樣）。
// 腳沒接到旋鈕會跟著上拉讀到 HIGH、跟著下拉讀到 LOW；接好的話由旋鈕決定電位，兩次讀到一樣。
// 但旋鈕轉在中段時電位剛好在 HIGH／LOW 的交界附近，接好也可能這樣讀到——所以原始讀值靠近兩端才說「沒接好」，中段只說「看不準」
int probeKnobPin(float raw) {
  pinMode(1, INPUT_PULLUP);
  int up = digitalRead(1);
  pinMode(1, INPUT_PULLDOWN);
  int dn = digitalRead(1);
  pinMode(1, INPUT);
  if (!(up == HIGH && dn == LOW)) return 1;
  return (raw < 0.15f || raw > 0.85f) ? 2 : 3;
}

// 整塊塗成一個顏色
void paint(const Box& b, Color c) {
  for (int j = 0; j < b.h; j++)
    for (int i = 0; i < b.w; i++) dot(b.x + i, b.y + j, c);
}

// 一塊的底色：過關＝綠、偵測到沒接好＝紅色一閃一閃、還沒試＝這個零件自己的顏色（暗的）。
// flip＝跟別塊錯開來閃（別塊亮的時候它暗）：8×8 的蜂鳴器左右緊貼著麥克風和傾斜，同時閃會連成一片，分不出是哪一項
Color baseColor(bool ok, bool bad, Color own, float t, bool flip) {
  if (bad) return (fmodf(t, 0.6f) < 0.3f) != flip ? RED : dim(RED, 0.2f);
  return ok ? dim(GREEN, 0.45f) : dim(own, UNTESTED);
}

// 按鈕那一塊的第 (i, j) 格是不是亮點：第 n 顆按鈕有 n 個亮點（大的排成一列置中，小的從左上依序排）
bool isPip(const Box& b, int n, int i, int j) {
  if (b.w < 7) return j * b.w + i < n;
  int start = (b.w - (2 * n - 1)) / 2;
  return j == b.h / 2 && i >= start && i < start + 2 * n - 1 && (i - start) % 2 == 0;
}

void drawButton(int n, float t) {                            // n＝0–3
  const Box& b = btnBox[n];
  if (stuck[n]) { paint(b, baseColor(false, true, BLUE, t, false)); return; }   // 一直是按著的：閃紅
  if (pressed(n)) { paint(b, WHITE); return; }               // 按著：整塊變白
  Color base = baseColor(okBtn[n], false, BLUE, t, false), pip = okBtn[n] ? LIT_OK : rgb(140, 140, 255);
  for (int j = 0; j < b.h; j++)
    for (int i = 0; i < b.w; i++) dot(b.x + i, b.y + j, isPip(b, n + 1, i, j) ? pip : base);
}

void drawKnob(float t) {
  const Box& b = knobBox;
  Color base = baseColor(okKnob, knobPin == 2, MAGENTA, t, false), lit = okKnob ? LIT_OK : MAGENTA;
  for (int j = 0; j < b.h; j++)
    for (int i = 0; i < b.w; i++) dot(b.x + i, b.y + j, i < knob.value() * b.w ? lit : base);   // 長條的長度＝旋鈕的位置
  if (okKnob) return;
  for (int j = 0; j < b.h; j++) {                            // 還沒過關：轉到過的那一端亮綠（提醒另一端也要轉到）
    if (knobLo) dot(b.x, b.y + j, GREEN);
    if (knobHi) dot(b.x + b.w - 1, b.y + j, GREEN);
  }
}

void drawMic(float t) {
  const Box& b = micBox;
  paint(b, baseColor(okMic, micProblem != 0, ORANGE, t, true));          // 閃的時間跟蜂鳴器錯開
  if (!audio.ready()) return;
  for (int i = 0; i < b.w; i++) {                            // 一欄代表幾個頻段，取其中最大聲的
    float v = 0;
    for (int k = i * BANDS / b.w; k < (i + 1) * BANDS / b.w; k++)
      if (audio.band(k) > v) v = audio.band(k);
    int height = (int)(v * b.h + 0.5f);
    for (int j = 0; j < height; j++) dot(b.x + i, b.y + b.h - 1 - j, okMic ? LIT_OK : ORANGE);
  }
}

void drawBuzzer(float t) {
  Color c = baseColor(okBuzz, !buzzer.ready(), YELLOW, t, false);
  if (buzzer.ready() && buzzer.playing()) c = WHITE;         // 正在響：變白
  paint(buzzBox, c);
}

void drawTilt(bool hasTilt, float t) {
  const Box& b = tiltBox;
  paint(b, baseColor(okTilt, hasTilt && !tilt.ready(), CYAN, t, true));   // 閃的時間跟蜂鳴器錯開
  if (!tilt.ready()) return;                                 // 沒有感測器：函式庫給的是模擬的搖擺，不拿來畫
  if (!okTilt) {                                             // 還沒過關：倒過的那個方向，那一邊的中間亮綠
    for (int j = (b.h - 1) / 2; j <= b.h / 2; j++) {
      if (tiltDir[0]) dot(b.x, b.y + j, GREEN);
      if (tiltDir[1]) dot(b.x + b.w - 1, b.y + j, GREEN);
    }
    for (int i = (b.w - 1) / 2; i <= b.w / 2; i++) {
      if (tiltDir[2]) dot(b.x + i, b.y, GREEN);
      if (tiltDir[3]) dot(b.x + i, b.y + b.h - 1, GREEN);
    }
  }
  float gx = constrain(tilt.x(), -1.0f, 1.0f), gy = constrain(tilt.y(), -1.0f, 1.0f);
  dot(b.x + (b.w - 1) / 2.0f * (1 + gx), b.y + (b.h - 1) / 2.0f * (1 + gy), WHITE);   // 白點＝往下的方向（像彈珠滾到低的那一邊）
}

void setup() {
  begin();
}

void loop() {
  float t = seconds();
  bool hasTilt = ON_BOARD ? true : tilt.ready();   // 板子上一定要有傾斜感測器（沒偵測到＝沒接好）；預覽沒有就不算這一項
  bool newProblem = false;                         // 這一格剛發現哪裡沒接好
  printed = false;

  // ── 每個零件過關了沒 ──
  for (int i = 0; i < NBTN; i++) {
    if (!pressed(i)) { heldFrom[i] = -1; stuck[i] = false; }
    else {
      if (heldFrom[i] < 0) heldFrom[i] = t;
      if (!stuck[i] && t - heldFrom[i] > STUCK_S) { stuck[i] = true; newProblem = true; }
    }
    if (!clicked(i)) continue;
    buzzer.beep(NOTES[i], 0.12f);        // 每顆按鈕一個音
    beeped = true;
    fanfareAt = 4;
    if (!okBtn[i]) { okBtn[i] = true; Serial.printf("✓ 按鈕 %d 過關\n", i + 1); printed = true; }
  }
  if (HAS_BUZZ && !okBuzz && buzzer.ready() && beeped) {
    okBuzz = true;
    Serial.println("✓ 蜂鳴器過關：線路有接通，剛剛也叫它響了（沒聽到聲音請跟老師說）");
    printed = true;
  }

  float raw = analogRead(1) / 4095.0f;   // 旋鈕的原始讀值：0＝0 V、1＝3.3 V
  if (raw < rawLo) rawLo = raw;
  if (raw > rawHi) rawHi = raw;
  if (t >= nextProbe) {
    int was = knobPin;
    knobPin = probeKnobPin(raw);
    nextProbe = t + 2;
    if (knobPin == 2 && was != 2) newProblem = true;
  }
  if (knob.value() <= 0.05f) knobLo = true;
  if (knob.value() >= 0.95f) knobHi = true;
  if (!okKnob && knobLo && knobHi && knobPin != 2) {
    okKnob = true;
    buzzer.beep(NOTE_C8, 0.12f);
    Serial.println("✓ 旋鈕過關");
    printed = true;
  }

  // 麥克風：安靜和大聲都要出現過才算——沒接好的麥克風不是一直沒聲音，就是一直滿格
  if (!audio.ready()) micFrom = -1;
  else {
    if (micFrom < 0) micFrom = t;
    if (t - micFrom > 1) {               // 剛開始收音的第一秒不算，數值還沒穩
      if (audio.level() < micLo) micLo = audio.level();
      if (audio.level() > micHi) micHi = audio.level();
      if (!okMic && micHi - micLo >= 0.45f) {
        okMic = true;
        buzzer.beep(NOTE_C8, 0.12f);
        Serial.println("✓ 麥克風過關");
        printed = true;
      }
    }
  }
  // 板子的麥克風沒焊好：I²S 照樣讀得到資料，只是一直是 0（沒聲音）或亂碼（一直滿格），永遠過不了關——過一陣子就明講。
  // 只是教室很安靜的話，拍一下手就有聲音，問題會自己收起來。沒有啟動（I²S 沒起來）跟焊點無關，另外說
  int micWas = micProblem;
  micProblem = 0;
  if (ON_BOARD && !okMic) {
    if (!audio.ready()) micProblem = 1;
    else if (t - micFrom > MIC_SILENT_S && micHi < 0.05f) micProblem = 2;
    else if (t - micFrom > MIC_FULL_S && micLo > 0.9f) micProblem = 3;
  }
  if (micProblem && micProblem != micWas) newProblem = true;

  if (tilt.ready()) {
    if (tilt.x() < -0.5f) tiltDir[0] = true;
    if (tilt.x() > 0.5f) tiltDir[1] = true;
    if (tilt.y() < -0.5f) tiltDir[2] = true;
    if (tilt.y() > 0.5f) tiltDir[3] = true;
    if (!okTilt && tiltDir[0] && tiltDir[1] && tiltDir[2] && tiltDir[3]) {
      okTilt = true;
      buzzer.beep(NOTE_C8, 0.12f);
      Serial.println("✓ 傾斜過關");
      printed = true;
    }
  }

  int total = NBTN + 2 + (HAS_BUZZ ? 1 : 0) + (hasTilt ? 1 : 0);   // 按鈕、旋鈕、麥克風，加上有的話才算的蜂鳴器、傾斜
  int done = okKnob + okMic + (HAS_BUZZ && okBuzz ? 1 : 0) + (hasTilt && okTilt ? 1 : 0);
  for (int i = 0; i < NBTN; i++) done += okBtn[i];
  if (!allOk && done == total) {
    allOk = true;
    partyUntil = t + 2.5f;
    fanfareAt = 0;
    Serial.printf("★ 全部過關（%d/%d）。要重測：%s\n", done, total, ON_BOARD ? "按板子上的 RESET 鍵" : "再按一次「▶ 執行」");
    printed = true;
  }
  if (fanfareAt < 4 && !buzzer.playing()) buzzer.beep(FANFARE[fanfareAt++], 0.1f);   // 過關音樂：上一個音響完接下一個

  // ── 文字 ──（一格只印一段：現況那一行工具頁會畫成上面的清單；其他幾行偶爾才印，才不會一直往上捲）
  if (done != lastDone) { lastDone = done; nextTodo = 0; }   // 有一項剛過關：馬上印新的「還沒過」
  if (newProblem) nextTodo = 0;                              // 剛發現哪裡沒接好：馬上說
  // 說明：開機的燈板檢查結束時印一次；燒完之後工具頁要過幾秒才接上板子，那一次常常沒收到，所以開頭 20 秒內多印兩次，之後 30 秒一次
  if (t >= nextLegend) { nextLegend = t + (t < 15 ? 7 : 30); legendStep = 1; }
  if (t >= nextTodo && t >= 1.6f) { nextTodo = t + 10; todoStep = 1; }   // 有變的時候馬上印，不然每 10 秒提醒一次

  if (!printed && t >= nextPrint) {      // 每半秒：一行現況
    nextPrint = t + 0.5f;
    const char* pin = !ON_BOARD ? "（預覽沒有硬體）" : knobPin == 2 ? "沒接好" : knobPin == 3 ? "看不準" : "接好";
    Serial.printf("零件檢查 %d/%d｜按鈕", done, total);     // 只列這塊板子有的零件（第一、二版沒有按鈕 3、4 和蜂鳴器）
    for (int i = 0; i < NBTN; i++) Serial.printf(" %d %s", i + 1, mark(okBtn[i], stuck[i]));
    Serial.printf("｜旋鈕 %s %.2f（原始 %d，跳動 %d，腳位%s）｜",
                  mark(okKnob, knobPin == 2), knob.value(), (int)(raw * 4095), (int)((rawHi - rawLo) * 4095), pin);
    if (micProblem) Serial.printf("麥克風 ✗ %s", micProblem == 1 ? "沒有啟動" : micProblem == 2 ? "沒聽到聲音" : "一直滿格");
    else Serial.printf("麥克風 %s 音量 %.2f", mark(okMic, false), audio.level());
    if (!hasTilt) Serial.print("｜傾斜（預覽沒有感測器，不算）");
    else if (!tilt.ready()) Serial.print("｜傾斜 ✗ 沒偵測到");
    else Serial.printf("｜傾斜 %s x%+.2f y%+.2f", mark(okTilt, false), tilt.x(), tilt.y());
    if (HAS_BUZZ) Serial.printf("｜蜂鳴器 %s", buzzer.ready() ? mark(okBuzz, false) : "✗ 沒偵測到");
    Serial.println();
    rawLo = 1; rawHi = 0;
    printed = true;
  }
  if (!printed && legendStep) {          // 每一塊是什麼、顏色的意思：兩行，一格印一行
    if (legendStep == 1) Serial.println(OLD_BOARD ? "燈板上：上面兩個角落＝按鈕 1、2（亮點的數目＝第幾顆）、橫的長條＝旋鈕、中間左＝麥克風、中間右＝傾斜（白點往低的那邊滾）"
                                                  : "燈板上：四個角落＝按鈕 1–4（亮點的數目＝第幾顆）、橫的長條＝旋鈕、中間左＝麥克風、正中間＝蜂鳴器、中間右＝傾斜（白點往低的那邊滾）");
    else Serial.println(OLD_BOARD ? "顏色：暗的＝還沒試，綠色＝過關，紅色一閃一閃＝沒接好，白色＝正按著"
                                  : "顏色：暗的＝還沒試，綠色＝過關，紅色一閃一閃＝沒接好，白色＝正按著或正在響");
    legendStep = legendStep == 1 ? 2 : 0;
    printed = true;
  }
  while (!printed && todoStep) {         // 哪裡沒接好（有的才印），最後是還有哪些沒過：一格印一行
    int step = todoStep;
    todoStep = step < 6 ? step + 1 : 0;
    if (step == 1 && HAS_BUZZ && !buzzer.ready()) {
      // 按鈕 3 或 4 按得到＝一定是第三版，只講焊點；還沒按到的話，順便告訴舊板子的人怎麼改
      if (okBtn[2] || okBtn[3]) Serial.println("✗ 沒偵測到蜂鳴器：檢查蜂鳴器和旁邊電阻的焊點。");
      else Serial.println("✗ 沒偵測到蜂鳴器：檢查蜂鳴器和旁邊電阻的焊點。板子下緣沒有按鈕的話是第一、二版（沒有蜂鳴器）：把程式最上面的 OLD_BOARD 改成 1 再燒一次。");
      printed = true;
    } else if (step == 2 && hasTilt && !tilt.ready()) {
      Serial.println("✗ 沒偵測到傾斜感測器：檢查傾斜感測器模組的焊點");
      printed = true;
    } else if (step == 3 && knobPin == 2) {
      Serial.println("✗ 讀不到旋鈕（中間那支腳沒焊好）：檢查旋鈕的焊點");
      printed = true;
    } else if (step == 4 && micProblem) {
      Serial.println(micProblem == 1 ? "✗ 麥克風沒有啟動：按板子上的 RESET 鍵重新開機再試；還是一樣的話請跟老師說"
                   : micProblem == 2 ? "✗ 麥克風一直沒聽到聲音：對著板子大聲拍手；拍了還是這樣，檢查麥克風模組的焊點"
                                     : "✗ 麥克風的音量一直是滿格：檢查麥克風模組的焊點");
      printed = true;
    } else if (step == 5 && (stuck[0] || stuck[1] || stuck[2] || stuck[3])) {
      Serial.print("✗ 按鈕");
      for (int i = 0; i < NBTN; i++) if (stuck[i]) Serial.printf(" %d", i + 1);
      Serial.println(" 一直是按著的：沒有按也這樣的話，檢查這顆按鈕的焊點有沒有跟旁邊連在一起");
      printed = true;
    } else if (step == 6 && !allOk) {
      // 已經用 ✗ 說明的（沒偵測到、沒接好）不列在這裡；都沒有可以列的就不印
      bool micTodo = !okMic && !micProblem, tiltTodo = hasTilt && tilt.ready() && !okTilt, buzzTodo = HAS_BUZZ && !okBuzz && buzzer.ready();
      int left = 0;                      // 還沒過的按鈕有幾顆
      for (int i = 0; i < NBTN; i++) if (!okBtn[i]) left++;
      if (!left && okKnob && !micTodo && !tiltTodo && !buzzTodo) continue;
      Serial.print("還沒過：");
      bool first = true;
      for (int i = 0; i < NBTN; i++) {
        if (okBtn[i]) continue;
        if (first) Serial.printf("按鈕 %d", i + 1);
        else Serial.printf("、%d", i + 1);
        first = false;
      }
      if (left == 1) Serial.print("（按一下）　");
      else if (left > 1) Serial.print("（各按一下）　");
      if (!okKnob) Serial.print("旋鈕（從最左轉到最右）　");
      if (micTodo) Serial.print(!audio.ready() ? "麥克風（預覽要先按「🎤 開啟麥克風」）　" : HAS_BUZZ && buzzer.ready() ? "麥克風（先安靜、再拍手或讓蜂鳴器響）　" : "麥克風（先安靜、再拍手）　");
      if (tiltTodo) Serial.print("傾斜（往四個邊各斜一下）　");
      if (buzzTodo) Serial.print("蜂鳴器（按任一顆按鈕）　");
      Serial.println();
      printed = true;
    }
  }

  // ── 燈板 ──
  if (t < 1.6f) {                        // 開機：整面紅、綠、藍、白各 0.4 秒（檢查燈板）
    Color c = t < 0.4f ? RED : t < 0.8f ? GREEN : t < 1.2f ? BLUE : WHITE;
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, c);
  } else if (t < partyUntil) {           // 全部過關：整面彩虹
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, hsv((x + y) * 360.0f / (WIDTH + HEIGHT) + t * 400, 255, 255));
  } else {                               // 平常：一塊一個零件
    clear();
    for (int i = 0; i < NBTN; i++) drawButton(i, t);       // 這塊板子沒有的零件（第一、二版的按鈕 3、4、蜂鳴器）不畫
    drawKnob(t);
    drawMic(t);
    if (HAS_BUZZ) drawBuzzer(t);
    drawTilt(hasTilt, t);
  }
  show();
}
