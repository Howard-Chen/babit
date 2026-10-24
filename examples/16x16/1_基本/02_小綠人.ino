// 小綠人
// @desc 行人號誌：小綠人走路；按鈕 1 開始紅綠燈倒數（越走越快、最後會閃），按鈕 2 換成倒數數字燈
// @loop 1.5
// 還沒按按鈕 1：小綠人照旋鈕的速度走（中間 1.5 秒走兩步，最左慢一半、最右快一半）；數字燈停在 15，等你按按鈕 1。
// 按鈕 1：號誌開始循環——綠燈倒數 15 秒（小綠人從平常的速度越走越快，最後是 2 倍；最後 8 秒一閃一閃，
//   一開始閃得慢、越接近 0 越快）→ 紅燈倒數 5 秒 → 綠燈倒數 …。倒數時旋鈕不管用。再按一次按鈕 1 就從頭開始。
// 按鈕 2：切換「小綠人燈」和「倒數數字燈」。數字燈：綠燈是黃色數字、紅燈是紅色數字。
// 兩片燈板組成一座號誌：一片放上面當小綠人燈，另一片按按鈕 2 換成數字燈放下面，兩片同時按按鈕 1 就一起倒數。
//   數字燈那片想一開機就是數字燈，把 START_DIGITS 改成 true。
// 亮度：BRIGHT 調整整面亮度（0–1，沒寫是 0.6）。16×16 的燈很多、小人又亮得很集中，比整面亮的範例刺眼，所以調得更暗。
// 小綠人是 17 格畫面輪流播（逐格動畫）。每格畫面 16 排，每排是一個 16 位元的數：
//   最左邊一格是最高位（0x8000），1＝亮（跟中文跑馬燈的字型一樣）。
#define PANEL 16
#include "BatoPixel.h"

const float GREEN_TIME = 15;           // 綠燈倒數幾秒
const float RED_TIME = 5;              // 紅燈倒數幾秒
const float BLINK_TIME = 8;            // 綠燈最後幾秒小綠人會閃
const bool START_DIGITS = false;       // 開機就是數字燈：改成 true
const float BRIGHT = 0.12;             // 整面亮度 0–1：覺得太暗就調大
const int FRAMES = 17;                 // 走兩步共 17 格畫面
const float FPS = FRAMES / 1.5;        // 平常每秒播幾格畫面：1.5 秒走兩步
const Color WALK_GREEN = hsv(125, 255, 255);    // 小綠人的綠
const Color AMBER = hsv(40, 255, 255);          // 綠燈倒數的黃色數字

const uint16_t WALK[FRAMES][16] = {
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x03A0, 0x0790,
   0x08D0, 0x00C0, 0x00A0, 0x0110, 0x0208, 0x0C04, 0x0004, 0x0000},   // 0
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03E0, 0x03B0, 0x0798,
   0x0CD0, 0x00C0, 0x00A0, 0x0118, 0x030C, 0x0D04, 0x0E0C, 0x0000},   // 1
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03E0, 0x0390, 0x0388,
   0x04C0, 0x00C0, 0x00A0, 0x0118, 0x0104, 0x0104, 0x0E08, 0x0000},   // 2
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x0320, 0x0390,
   0x04D0, 0x00C0, 0x0120, 0x0238, 0x0208, 0x0130, 0x0700, 0x0000},   // 3
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x0360, 0x03B0,
   0x05F0, 0x00C0, 0x01E0, 0x0278, 0x0238, 0x0338, 0x0708, 0x0300},   // 4
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x0380, 0x0340, 0x01A0,
   0x01A0, 0x00C0, 0x01C0, 0x0240, 0x0030, 0x0308, 0x0108, 0x0300},   // 5
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x0380, 0x0340, 0x0180,
   0x0380, 0x0180, 0x0380, 0x0480, 0x0440, 0x0320, 0x0120, 0x0700},   // 6
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x0380, 0x0380, 0x0180,
   0x01C0, 0x01C0, 0x02E0, 0x00A0, 0x00E0, 0x0020, 0x00A0, 0x0000},   // 7
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x01E0, 0x07E0,
   0x01C0, 0x01C0, 0x01C0, 0x02C0, 0x0160, 0x0710, 0x0050, 0x0038},   // 8
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x0380, 0x0340, 0x01A0,
   0x01A0, 0x00C0, 0x01C0, 0x0240, 0x0030, 0x0308, 0x0108, 0x0300},   // 9
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03E0, 0x0390, 0x0388,
   0x04C0, 0x00C0, 0x00A0, 0x0118, 0x0104, 0x0104, 0x0E08, 0x0000},   // 10
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x0320, 0x0390,
   0x04D0, 0x00C0, 0x0120, 0x0238, 0x0208, 0x0130, 0x0700, 0x0000},   // 11
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0700, 0x0780, 0x07C0, 0x03C0,
   0x03C0, 0x0180, 0x0380, 0x0480, 0x0460, 0x0730, 0x0330, 0x0700},   // 12
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x0380, 0x0340, 0x0180,
   0x0380, 0x0180, 0x0380, 0x0480, 0x0440, 0x0320, 0x0120, 0x0700},   // 13
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x0380, 0x0380, 0x0180,
   0x01C0, 0x01C0, 0x02E0, 0x00A0, 0x00E0, 0x0020, 0x00A0, 0x0000},   // 14
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x01E0, 0x07E0,
   0x01C0, 0x01C0, 0x01C0, 0x02C0, 0x0160, 0x0710, 0x0050, 0x0038},   // 15
  {0x0000, 0x0600, 0x0F00, 0x0600, 0x0300, 0x03C0, 0x03E0, 0x07F0,
   0x09D0, 0x01C0, 0x01E0, 0x03D0, 0x0368, 0x0F14, 0x0054, 0x0038},   // 16
};

// 紅燈的小紅人：正面站著，方頭、手垂在身體兩側，最下面兩排腳往外伸（像兩個 L）
const uint16_t STAND[16] = {0x0000, 0x03C0, 0x03C0, 0x03C0, 0x0180, 0x1FF8, 0x1FF8, 0x1BD8,
                            0x1BD8, 0x1BD8, 0x1BD8, 0x07E0, 0x0660, 0x0660, 0x0E70, 0x1E78};

// 七段數字：每個數字亮哪幾段（bit0–6＝a 上、b 右上、c 右下、d 下、e 左下、f 左上、g 中）
const uint8_t SEG[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
const int DW = 6, DH = 13;             // 一個數字寬 6 格、高 13 格
const int GAP = 2, Y0 = 1;             // 十位和個位之間空幾欄、數字最上面在第幾排

bool digits = START_DIGITS;  // true＝倒數數字燈
bool cycling = false;        // 按過按鈕 1：號誌一直循環（綠燈倒數 → 紅燈倒數 → 綠燈倒數 …）
float startT = 0;            // 按下按鈕 1 的時間
float phase = 0;             // 小綠人播到第幾格畫面（有小數）：每格加上「每秒幾格 × 經過的秒數」，速度變了畫面才不會跳
float blink = 0;             // 閃爍進度：每格加上「每秒閃幾次 × 經過的秒數」，小數部分前一半亮、後一半暗
float lastT = 0;             // 上一格的 seconds()

// 畫一格小人（16 排的數）
void drawRows(const uint16_t* rows, Color c) {
  for (int y = 0; y < 16; y++)
    for (int x = 0; x < 16; x++)
      if (rows[y] & (0x8000 >> x)) dot(x, y, c);
}

// 在 (x0, y0) 畫一個七段數字：bits＝要亮哪幾段（SEG 裡的值），每一段都畫到兩端的角
void drawSegments(uint8_t bits, int x0, int y0, Color c) {
  const int M = DH / 2;                                   // 中間那段在第幾排
  for (int i = 0; i < DW; i++) {
    if (bits & 0x01) dot(x0 + i, y0, c);                  // a 上
    if (bits & 0x40) dot(x0 + i, y0 + M, c);              // g 中
    if (bits & 0x08) dot(x0 + i, y0 + DH - 1, c);         // d 下
  }
  for (int j = 0; j <= M; j++) {
    if (bits & 0x20) dot(x0, y0 + j, c);                  // f 左上
    if (bits & 0x02) dot(x0 + DW - 1, y0 + j, c);         // b 右上
  }
  for (int j = M; j < DH; j++) {
    if (bits & 0x10) dot(x0, y0 + j, c);                  // e 左下
    if (bits & 0x04) dot(x0 + DW - 1, y0 + j, c);         // c 右下
  }
}

// 畫倒數的數字（1–99），整個數字放在畫面中間，比較好讀：
// 一位數就一個數字置中；兩位數時十位的「1」只亮右邊那一直排，所以只算一欄寬，整個數字一起置中
void drawNumber(int n, Color c) {
  int tens = n / 10 % 10, ones = n % 10;
  if (n < 10) {
    drawSegments(SEG[ones], (WIDTH - DW + 1) / 2, Y0, c);
    return;
  }
  int tw = tens == 1 ? 1 : DW;                    // 十位佔幾欄
  int x = (WIDTH - (tw + GAP + DW) + 1) / 2;      // 整個數字最左邊在第幾欄
  drawSegments(SEG[tens], x + tw - DW, Y0, c);    // 十位（「1」往左放，讓亮的那排落在第 x 欄）
  drawSegments(SEG[ones], x + tw + GAP, Y0, c);   // 個位
}

void setup() {
  begin();
  brightness(BRIGHT);        // 整面亮度（沒寫是 0.6）
}

void loop() {
  float t = seconds();
  float dt = t - lastT;      // 跟上一格差幾秒（大約 1/60）
  lastT = t;

  if (button1.clicked()) { cycling = true; startT = t; phase = 0; }   // 按一下按鈕 1：從綠燈倒數開始，小綠人從第一格重新走（再按就從頭）
  if (button2.clicked()) digits = !digits;                  // 按一下按鈕 2：小綠人燈 ↔ 數字燈

  float speed = FPS * (0.5f + knob.value());          // 還沒按按鈕 1：旋鈕決定走多快（平常的 0.5～1.5 倍）
  bool red = false;          // 現在是不是紅燈
  bool visible = true;       // 小綠人這一格亮不亮（最後幾秒會閃）
  int left = (int)GREEN_TIME;    // 數字燈顯示幾：還沒按按鈕 1 時停在綠燈的秒數
  if (cycling) {
    float c = fmodf(t - startT, GREEN_TIME + RED_TIME);    // 這一輪過了幾秒
    red = c >= GREEN_TIME;
    left = (int)ceilf((red ? GREEN_TIME + RED_TIME : GREEN_TIME) - c);   // 倒數剩幾秒
    if (!red) {
      float u = c / GREEN_TIME;                            // 綠燈過了幾成（0→1）
      speed = FPS * (1 + u * u);                           // 倒數時不管旋鈕：從平常的速度開始，越接近 0 越快，最後 2 倍
      float b = c - (GREEN_TIME - BLINK_TIME);             // 進入最後幾秒多久了
      if (b > 0) {
        blink += (0.8f + 4.2f * sq(b / BLINK_TIME)) * dt;  // 一開始一秒閃 0.8 次，越接近 0 越快，最後一秒閃 5 次
        visible = fmodf(blink, 1) < 0.5f;
      } else blink = 0;
    }
  }
  phase = fmodf(phase + speed * dt, FRAMES);

  clear();
  if (digits) drawNumber(left, red ? RED : AMBER);         // 數字燈：綠燈黃字、紅燈紅字
  else if (red) drawRows(STAND, RED);                      // 小綠人燈：紅燈是小紅人
  else if (visible) drawRows(WALK[(int)phase], WALK_GREEN);
  show();
}
