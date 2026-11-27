// 聖誕花圈
// @desc 掛在門上的聖誕花圈：開門就唱聖誕歌、長出聖誕樹掛滿燈泡。按鈕 1、3 演一次，2、4 開關聲音。
const int TURN = 0;                 // 方向：USB 朝左 0、上 90、右 180、下 270
const float DOOR_SENSE = 0.5f;      // 開門靈敏度 0～1，越大越敏感
const bool SOUND_TRIGGER = true;    // 敲門、拍手也會演
const float SOUND_LEVEL = 0.4f;     // 多大聲才會演 0～1，越小越敏感（原本 0.5）
const float COOLDOWN = 2;           // 演完幾秒內不再觸發
const float LOOP_REST = 3;          // 按住按鈕 1 五秒＝一直輪播；演完休息幾秒
const float BRIGHT = 0.075f;        // 燈板亮度，調高只有接充電器才變亮
const float STRIP_BRIGHT = 0.075f;  // 燈條亮度，同上
#define STRIP 60                    // 燈條幾顆燈（接 B）
const float BEAT = 0.5f;            // 一拍幾秒，越小越快
const int OCTAVE = 0;               // 歌升降幾個八度：1 高一個八度、-1 低一個八度
const float PREVIEW_EVERY = 45;     // 網頁預覽每幾秒自己演一次

#define PANEL 16
#include "BatoPixel.h"

#ifndef NOTE_C7                            // 舊版工具沒有蜂鳴器：不出聲的替身
#define NOTE_G6 1568
#define NOTE_A6 1760
#define NOTE_B6 1976
#define NOTE_C7 2093
#define NOTE_D7 2349
#define NOTE_E7 2637
#define NOTE_F7 2794
#define NOTE_G7 3136
#define NOTE_C8 4186
struct QuietBuzzer { void beep(float, float) {} void off() {} };
QuietBuzzer buzzer;
#endif
#ifndef BP_BTN3_PIN                        // 舊版工具沒有按鈕 3、4
struct NoButton { bool clicked() const { return false; } bool pressed() const { return false; } };
NoButton button3, button4;
#endif
#ifndef BP_STRIP_MAX                       // 舊版工具沒有燈條
struct NoStrip { void dot(float, Color) const {} void brightness(float) const {} };
NoStrip strip;
#endif

struct C3 { float r, g, b; };              // 一個顏色（算的時候用小數）
struct Spark { float x, y, vx, vy, life, span; C3 c; };   // 火花、星塵：會飛、會慢慢暗掉
struct Flake { float x, y, vy, ph; bool on; };             // 雪花

// ───── 顏色 ─────
const C3 GOLD = {255, 165, 20};            // 金色
const C3 GOLD_HI = {255, 235, 150};        // 金色字上流過的亮光
const C3 SNOW_C = {200, 215, 255};         // 雪
const C3 TREE_C = {20, 150, 45};           // 聖誕樹
const C3 TRUNK_C = {130, 60, 15};          // 樹幹
const C3 RED_C = {255, 25, 30};
const C3 GREEN_C = {20, 220, 60};
const C3 WHITE_C = {255, 255, 255};
const C3 WARM = {255, 140, 50};            // 燈條待機的暖白
const C3 ORN_C[4] = {{255, 25, 30}, {255, 170, 20}, {40, 100, 255}, {255, 40, 170}};   // 燈泡：紅、金、藍、粉紅

// ───── 旋律：〈We Wish You a Merry Christmas〉（傳統曲）──────────────────────
// C 大調、放在第 6–7 八度（這顆蜂鳴器 2000–3000 Hz 最大聲，聽起來像音樂盒）。
// 一個音：{音高, 長度}，長度 8＝一拍、4＝半拍；唱兩遍，第二遍最後一個音拉長，再接一串往上的快音收尾。
const int16_t SONG[][2] = {
  {NOTE_G6, 8},                                                                  // 第一遍（拍子 0 是弱起的那個音）
  {NOTE_C7, 8}, {NOTE_C7, 4}, {NOTE_D7, 4}, {NOTE_C7, 4}, {NOTE_B6, 4},          // 第 1 小節
  {NOTE_A6, 8}, {NOTE_A6, 8}, {NOTE_A6, 8},                                      // 2
  {NOTE_D7, 8}, {NOTE_D7, 4}, {NOTE_E7, 4}, {NOTE_D7, 4}, {NOTE_C7, 4},          // 3
  {NOTE_B6, 8}, {NOTE_G6, 8}, {NOTE_G6, 8},                                      // 4
  {NOTE_E7, 8}, {NOTE_E7, 4}, {NOTE_F7, 4}, {NOTE_E7, 4}, {NOTE_D7, 4},          // 5
  {NOTE_C7, 8}, {NOTE_A6, 8}, {NOTE_G6, 4}, {NOTE_G6, 4},                        // 6
  {NOTE_A6, 8}, {NOTE_D7, 8}, {NOTE_B6, 8},                                      // 7
  {NOTE_C7, 16},                                                                 // 8（拍子 22–24）
  {NOTE_G6, 8},                                                                  // 第二遍（拍子 24）
  {NOTE_C7, 8}, {NOTE_C7, 4}, {NOTE_D7, 4}, {NOTE_C7, 4}, {NOTE_B6, 4},
  {NOTE_A6, 8}, {NOTE_A6, 8}, {NOTE_A6, 8},
  {NOTE_D7, 8}, {NOTE_D7, 4}, {NOTE_E7, 4}, {NOTE_D7, 4}, {NOTE_C7, 4},
  {NOTE_B6, 8}, {NOTE_G6, 8}, {NOTE_G6, 8},
  {NOTE_E7, 8}, {NOTE_E7, 4}, {NOTE_F7, 4}, {NOTE_E7, 4}, {NOTE_D7, 4},
  {NOTE_C7, 8}, {NOTE_A6, 8}, {NOTE_G6, 4}, {NOTE_G6, 4},
  {NOTE_A6, 8}, {NOTE_D7, 8}, {NOTE_B6, 8},
  {NOTE_C7, 32},                                                                 // 最後的長音（拍子 46–50）
  {NOTE_G6, 1}, {NOTE_C7, 1}, {NOTE_E7, 1}, {NOTE_G7, 1}, {NOTE_C8, 4}};         // 收尾的快音（拍子 50–51）
const int SONG_LEN = sizeof(SONG) / sizeof(SONG[0]);
const float PITCH = OCTAVE >= 0 ? (float)(1 << OCTAVE) : 1.0f / (1 << -OCTAVE);   // OCTAVE 換成音高的倍數
const float INTRO_SEC = 2.0f;              // 開場的叮咚有幾秒（之後才開始唱）
const float END_BEAT = 54;                 // 第幾拍演完（51 拍唱完，再花 3 拍暗回待機）

// ───── 圖案 ─────
// 雪橇（往左飛：前面是麋鹿，後面是聖誕老人和紅色雪橇）。A 鹿角、B 麋鹿、N 紅鼻子、K 韁繩、R 紅、W 白、G 金色滑板
const char* SLEIGH[6] = {
  ".A.A........W..",
  "NBB.......RR...",
  "..BBBBKKKKWW.R.",
  "..BBBB...RRRRRR",
  "..B..B..GRRRRR.",
  ".........GGGGGG"};
const int SLEIGH_W = 15;
// 聖誕樹：從下往上每一排 {y, 左, 右}；第一排是樹幹
const int8_t TREE_ROWS[11][3] = {{13, 7, 8}, {12, 1, 14}, {11, 2, 13}, {10, 3, 12}, {9, 5, 10}, {8, 3, 12},
                                 {7, 4, 11}, {6, 6, 9}, {5, 5, 10}, {4, 6, 9}, {3, 7, 8}};
const int8_t GROW[6] = {2, 4, 6, 8, 10, 11};   // 長樹的 6 拍：每一拍長到第幾排
// 樹上的燈泡（照亮起的順序）
const int8_t ORN[13][2] = {{7, 4}, {9, 5}, {6, 5}, {8, 7}, {5, 8}, {11, 8}, {8, 9},
                           {4, 10}, {10, 10}, {6, 11}, {12, 11}, {3, 12}, {9, 12}};
// 5×7 的字：每個字 7 排、每排 5 個點（最左邊是 0b10000）
const uint8_t G_M[7] = {0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001};
const uint8_t G_E[7] = {0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111};
const uint8_t G_R[7] = {0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001};
const uint8_t G_Y[7] = {0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100};
const uint8_t G_X[7] = {0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001};
const uint8_t G_A[7] = {0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001};
const uint8_t G_S[7] = {0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110};
const char* MSG = "MERRY XMAS";
const float PI_F = 3.14159265f;

// ───── 狀態 ─────
bool showing = false;                      // 正在演出
float showT = 0;                           // 演出開始後幾秒
float coolT = 0;                           // 冷卻還剩幾秒
float idleT = 0;                           // 待機了幾秒（預覽自己演用）
bool firstDemo = true;
bool soundOn = true;                       // 按鈕 2：聲音開／關
float iconT = 0;                           // 按鈕 2：音符圖示還要顯示幾秒
bool loopMode = false;                     // 輪播：按住按鈕 1 五秒開始，再按一下取消
float holdT = 0, restT = 0, loopIconT = 0; // 按住幾秒、演完休息了幾秒、輪播圖示還要顯示幾秒
bool holdDone = false;
int songI = 0;                             // 唱到第幾個音
long songAt = 0;                           // 下一個音從第幾個「八分之一拍」開始
bool dingDone = false, dongDone = false;   // 開場的叮、咚
int lastBeat = -99;                        // 上一個走過的拍子
bool beatNow = false, noteNow = false;     // 這一格剛好跳到新的拍子、新的音
float beatK = 0;                           // 拍子的閃光（1 → 慢慢變 0）
int litN = 0;                              // 樹上亮了幾顆燈泡
float popK[13];                            // 每顆燈泡剛亮起的閃光
int ornShift = 0;                          // 第二遍：燈泡跟著音符換顏色
float starK = 0;                           // 樹頂星星的亮度
bool starBurst = false, flourishDone = false;
Spark sp[80];
int spN = 0;
Flake fl[30];
float ground[WIDTH];                       // 每一欄積了多高的雪（格）
C3 fb[HEIGHT][WIDTH];                      // 這一格的畫面
C3 sb[STRIP];                              // 燈條這一格的顏色
float tw[STRIP];                           // 燈條每顆燈的閃光
float gZero[3] = {0, 0, 0};                // 陀螺儀的零點：不動也會讀到幾 °/s，還會隨溫度慢慢飄，用慢速平均跟著
float gZeroT = 0;                          // 零點量了幾秒（開機先量 3 秒，才開始偵測開門）
float lastSec = 0, clk = 0;

C3 mixC(C3 a, C3 b, float k) { return {a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k}; }
C3 mulC(C3 a, float k) { return {a.r * k, a.g * k, a.b * k}; }
float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
float smooth(float a, float b, float v) { float t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
float rnd(float a, float b) { return a + (b - a) * random(10001) / 10000.0f; }
int toByte(float v) { return v < 0 ? 0 : (v > 255 ? 255 : (int)(v + 0.5f)); }
C3 hueC(float h) { Color c = hsv(h, 255, 255); return {(float)c.r, (float)c.g, (float)c.b}; }

// ───── 畫圖 ─────
void addPx(int x, int y, C3 c, float k) {          // 加亮一格（疊加）
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  fb[y][x].r += c.r * k; fb[y][x].g += c.g * k; fb[y][x].b += c.b * k;
}
void setPx(int x, int y, C3 c, float a) {          // 蓋上一格（a＝蓋多少）
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  fb[y][x] = mixC(fb[y][x], c, a);
}
void addSoft(float x, float y, C3 c, float k) {    // 小數座標的一點：分到旁邊四格，移動才會平滑
  float px = x - 0.5f, py = y - 0.5f;
  int ix = (int)floorf(px), iy = (int)floorf(py);
  float fx = px - ix, fy = py - iy;
  addPx(ix, iy, c, k * (1 - fx) * (1 - fy)); addPx(ix + 1, iy, c, k * fx * (1 - fy));
  addPx(ix, iy + 1, c, k * (1 - fx) * fy); addPx(ix + 1, iy + 1, c, k * fx * fy);
}

void turnDot(int x, int y, Color c) {              // 照燈板的方向（TURN）轉正再點亮
#ifdef __EMSCRIPTEN__
  const int q = 0;                                 // 網頁預覽一律畫正的
#else
  const int q = ((TURN % 360 + 360) % 360) / 90;   // 轉了幾個 90°
#endif
  if (q == 1) { int t = x; x = y; y = WIDTH - 1 - t; }          // USB 朝上：燈板順時針轉了 90°，畫面逆時針轉回來
  else if (q == 2) { x = WIDTH - 1 - x; y = HEIGHT - 1 - y; }   // USB 朝右：轉了 180°
  else if (q == 3) { int t = x; x = WIDTH - 1 - y; y = t; }     // USB 朝下：燈板逆時針轉了 90°，畫面順時針轉回來
  dot(x, y, c);
}

// ───── 火花、星塵 ─────
void spark(float x, float y, float vx, float vy, C3 c, float span) {
  if (spN >= 80) return;
  sp[spN++] = {x, y, vx, vy, span, span, c};
}
void burst(float x, float y, C3 c, int n, float spd, float span) {   // 從一點往四面八方噴
  for (int k = 0; k < n; k++) {
    float a = rnd(0, 2 * PI_F), s = spd * rnd(0.35f, 1.0f);
    spark(x, y, cosf(a) * s, sinf(a) * s, c, span * rnd(0.6f, 1.0f));
  }
}
void updateSparks(float dt) {
  for (int k = 0; k < spN;) {
    Spark &s = sp[k];
    s.life -= dt;
    if (s.life <= 0) { s = sp[--spN]; continue; }
    float drag = expf(-dt * 2.5f);
    s.vx *= drag; s.vy = s.vy * drag + 3 * dt;     // 慢下來、往下掉一點
    s.x += s.vx * dt; s.y += s.vy * dt;
    k++;
  }
}
void drawSparks() {
  for (int k = 0; k < spN; k++) {
    float f = sp[k].life / sp[k].span, tw0 = 0.75f + 0.25f * sinf(clk * 40 + k * 2.1f);   // 一閃一閃
    addSoft(sp[k].x, sp[k].y, sp[k].c, f * f * tw0 * 1.4f);
  }
}

// ───── 下雪 ─────
void updateSnow(float dt, float rate) {
  if (random(1000) < rate * dt * 1000)
    for (int k = 0; k < 30; k++)
      if (!fl[k].on) { fl[k] = {rnd(0, WIDTH), -0.5f, rnd(1.6f, 3.2f), rnd(0, 6.28f), true}; break; }
  for (int k = 0; k < 30; k++) {
    Flake &f = fl[k];
    if (!f.on) continue;
    f.y += f.vy * dt;
    f.x += sinf(clk * 2 + f.ph) * 0.6f * dt;       // 左右飄
    int col = (int)constrain(f.x, 0.0f, WIDTH - 1.0f);
    if (f.y > HEIGHT - ground[col] - 0.3f) {       // 落地：積起來
      f.on = false;
      ground[col] = fminf(2.0f, ground[col] + 0.12f);
    }
  }
}
void drawSnow(float k0) {
  for (int k = 0; k < 30; k++) if (fl[k].on) addSoft(fl[k].x, fl[k].y, SNOW_C, 0.85f * k0);
}
void drawGround() {                                // 地上的積雪：每一欄從下往上
  for (int x = 0; x < WIDTH; x++)
    for (int r = 0; r < 2; r++) {
      float a = clamp01(ground[x] - r);
      if (a > 0) setPx(x, HEIGHT - 1 - r, mulC(SNOW_C, 0.75f - 0.2f * r), a);
    }
}

// ───── 聖誕樹 ─────
void drawTree(float b) {
  int shown = b < 19 ? GROW[(int)fminf(5, b - 13)] : 11;   // 一拍長一段
  int prev = b < 19 && b >= 14 ? GROW[(int)(b - 14)] : (b < 14 ? 0 : 11);
  float pop = b < 19 ? 1 - (b - floorf(b)) : 0;            // 剛長出來那一段亮一下
  int sink = (int)(smooth(31, 33, b) * 14);                // 拖字之前沉進雪地
  for (int k = 0; k < shown; k++) {
    int y = TREE_ROWS[k][0] + sink;
    C3 c = k == 0 ? TRUNK_C : TREE_C;
    if (k >= prev) c = mixC(c, {120, 255, 140}, pop * 0.8f);
    for (int x = TREE_ROWS[k][1]; x <= TREE_ROWS[k][2]; x++) setPx(x, y, c, 1);
  }
  for (int k = 0; k < litN; k++) {                         // 燈泡
    C3 c = ORN_C[(k + ornShift) % 4];
    float w = 0.75f + 0.25f * sinf(clk * 5 + k * 1.7f);
    setPx(ORN[k][0], ORN[k][1] + sink, mixC(mulC(c, w), WHITE_C, popK[k] * 0.7f), 1);
  }
  if (starK > 0) {                                         // 樹頂的星星
    float w = starK * (0.85f + 0.15f * sinf(clk * 7));
    for (int x = 7; x <= 8; x++) { setPx(x, 2 + sink, mulC(GOLD_HI, w), 1); setPx(x, 1 + sink, mulC(GOLD, w * 0.8f), 1); }
    addPx(6, 2 + sink, GOLD, 0.35f * w); addPx(9, 2 + sink, GOLD, 0.35f * w);
  }
}

// ───── 雪橇、金色字 ─────
C3 sleighColor(char ch) {
  switch (ch) {
    case 'A': return {200, 130, 60};
    case 'B': return {190, 95, 30};
    case 'N': return {255, 20, 10};
    case 'K': return {230, 170, 50};
    case 'R': return {235, 20, 30};
    case 'W': return {255, 255, 255};
    default:  return {255, 175, 30};
  }
}
void drawSleigh(int sx, int sy) {
  for (int r = 0; r < 6; r++)
    for (int c = 0; c < SLEIGH_W; c++) {
      char ch = SLEIGH[r][c];
      if (ch != '.') setPx(sx + c, sy + r, sleighColor(ch), 1);
    }
  if (random(100) < 45) spark(sx + SLEIGH_W - 1 + rnd(0, 1), sy + rnd(3, 6), rnd(1, 3), rnd(-0.6f, 0.6f), GOLD, rnd(0.4f, 0.9f));   // 星塵
}
const uint8_t* glyph(char ch) {
  switch (ch) {
    case 'M': return G_M; case 'E': return G_E; case 'R': return G_R; case 'Y': return G_Y;
    case 'X': return G_X; case 'A': return G_A; default: return G_S;
  }
}
void drawText(int tx, int ty) {                    // 金色 MERRY XMAS，字上有一道亮光流過
  int x = tx;
  float hb = fmodf(clk * 22, 80) - 10;             // 亮光的位置（從字頭往字尾）
  for (int i = 0; MSG[i]; i++) {
    if (MSG[i] == ' ') { x += 3; continue; }
    const uint8_t *g = glyph(MSG[i]);
    for (int r = 0; r < 7; r++)
      for (int c = 0; c < 5; c++)
        if (g[r] & (0b10000 >> c)) {
          float k = clamp01(1 - fabsf(x + c - tx - hb) / 4);
          setPx(x + c, ty + r, mixC(GOLD, GOLD_HI, k), 1);
        }
    x += 6;
  }
}

// ───── 燈條 ─────
void stripAdd(float pos, C3 c, float k) {          // 燈條上小數位置的一點（繞一圈接回來）
  pos = fmodf(pos, STRIP);
  if (pos < 0) pos += STRIP;
  int i0 = (int)pos % STRIP, i1 = (i0 + 1) % STRIP;
  float f = pos - (int)pos;
  sb[i0].r += c.r * k * (1 - f); sb[i0].g += c.g * k * (1 - f); sb[i0].b += c.b * k * (1 - f);
  sb[i1].r += c.r * k * f; sb[i1].g += c.g * k * f; sb[i1].b += c.b * k * f;
}
void stripComet(float pos, C3 c, int len, float k) {   // 一顆流星：頭最亮、後面拖尾巴
  for (int j = 0; j < len; j++) stripAdd(pos - j, c, k * powf(1 - (float)j / len, 2));
}
void stripIdle(float k) {                          // 待機：很暗的暖白，偶爾一顆眨眼
  if (random(1000) < 25) tw[random(STRIP)] = 1;
  for (int i = 0; i < STRIP; i++) sb[i] = mixC(sb[i], mulC(WARM, 0.1f + 0.5f * tw[i]), k);
}
void stripShow(float dt, float b) {
  float seg = STRIP / 12.0f;                     // 一段的長度（整圈 12 段）
  if (b < 0) {                                     // 開場：金色流星繞一圈
    stripIdle(1);
    stripComet(showT / INTRO_SEC * STRIP, GOLD, 10, 1);
  } else if (b < 7) {                              // ① 一顆燈，一拍跳一格
    stripAdd(lastBeat * seg, WHITE_C, 0.35f + 0.65f * beatK);
  } else if (b < 13) {                             // ② 金色流星繞圈（跟著雪橇）
    stripComet((b - 7) / 3 * STRIP, GOLD, (int)(seg * 2), 1);
  } else if (b < 24) {                             // ③ 紅綠跑馬，一拍走一段；④ 再加上音符的白色閃光
    for (int i = 0; i < STRIP; i++) {
      bool red = ((int)(i / seg) + lastBeat) % 2 == 0;
      sb[i] = mulC(red ? RED_C : GREEN_C, 0.4f + 0.4f * beatK);
    }
    if (b >= 19 && noteNow) tw[random(STRIP)] = 1;
  } else if (b < 31) {                             // ⑤ 彩虹慢慢轉，每個音一小串亮起
    for (int i = 0; i < STRIP; i++) sb[i] = mulC(hueC((float)i / STRIP * 360 + b * 25), 0.45f);
    if (noteNow) { int p = random(STRIP); for (int j = -2; j <= 2; j++) tw[(p + j + STRIP) % STRIP] = 1 - fabsf(j) * 0.3f; }
  } else if (b < 37) {                             // ⑥ 彩虹轉得快，整圈跟著拍子亮
    for (int i = 0; i < STRIP; i++) sb[i] = mulC(hueC((float)i / STRIP * 360 + b * 90), 0.4f + 0.6f * beatK);
  } else if (b < 46) {                             // ⑦ 金色跑馬（半拍走一段）＋越來越多閃光
    int step = (int)(b * 2);
    for (int i = 0; i < STRIP; i++) sb[i] = mulC(((int)(i / seg) + step) % 2 ? GOLD : WARM, 0.45f + 0.4f * beatK);
    if (random(100) < 20 + (b - 37) * 6) tw[random(STRIP)] = 1;
  } else if (b < 51) {                             // ⑧ 整圈金色，跟著煙火的拍子閃；收尾時白光跑一圈
    for (int i = 0; i < STRIP; i++) sb[i] = mulC(GOLD, 0.5f + 0.5f * beatK);
    if (random(100) < 60) tw[random(STRIP)] = 1;
    if (b >= 50) stripComet((b - 50) * 2.5f * STRIP, WHITE_C, 8, 1);
  } else {                                         // 慢慢暗回待機
    float k = smooth(51, END_BEAT, b);
    for (int i = 0; i < STRIP; i++) sb[i] = mulC(GOLD, 0.5f * (1 - k));
    stripIdle(k);
  }
  if (b >= 0 && b < 51)
    for (int i = 0; i < STRIP; i++) sb[i] = mixC(sb[i], WHITE_C, tw[i] * 0.8f);   // 閃光
  for (int i = 0; i < STRIP; i++) tw[i] *= expf(-dt / 0.25f);
}

// ───── 演出 ─────
void startShow() {
  showing = true; showT = 0; songI = 0; songAt = 0; lastBeat = -99;
  dingDone = false; dongDone = false; starBurst = false; flourishDone = false;
  litN = 0; ornShift = 0; starK = 0; spN = 0;
  for (int k = 0; k < 13; k++) popK[k] = 0;
  for (int k = 0; k < 30; k++) fl[k].on = false;
  for (int x = 0; x < WIDTH; x++) ground[x] = 0;
  buzzer.off();
}

void music(float b) {                              // 照拍子叫蜂鳴器唱，並記下「這一格剛好換音」給畫面用
  if (!dingDone && showT >= 0.1f) {
    dingDone = true;
    if (soundOn) buzzer.beep(NOTE_E7 * PITCH, 0.35f);
    burst(8, 8, GOLD, 26, 9, 1.0f);
  }
  if (!dongDone && showT >= 0.6f) {
    dongDone = true;
    if (soundOn) buzzer.beep(NOTE_C7 * PITCH, 0.8f);
    burst(8, 8, GOLD_HI, 18, 6, 1.2f);
  }
  if (b < 0) return;
  float u = b * 8;                                 // 現在在第幾個「八分之一拍」
  while (songI < SONG_LEN && u >= songAt) {
    int f = SONG[songI][0], len = SONG[songI][1];
    bool late = songI + 1 < SONG_LEN && u >= songAt + len;   // 這一格已經跨過整個音（卡頓）：跳過不唱
    if (!late && soundOn && f > 0) buzzer.beep(f * PITCH, len * BEAT / 8 * (len >= 8 ? 0.9f : 0.8f));
    if (f > 0) noteNow = true;
    songAt += len;
    songI++;
  }
}

void runShow(float dt) {
  float b = (showT - INTRO_SEC) / BEAT;            // 第幾拍（開場時是負的）
  noteNow = false; beatNow = false;
  music(b);
  if (b >= 0 && (int)floorf(b) != lastBeat) { lastBeat = (int)floorf(b); beatNow = true; beatK = 1; }

  float rate = b < 0 ? 0 : (b < 24 ? 5 : (b < 31 ? 12 : (b < 46 ? 2 : 3)));   // 下雪：第一遍少、第二遍多，拖字時少一點（字才看得清楚）
  updateSnow(dt, rate);
  drawSnow(1 - 0.7f * smooth(31, 32.5f, b) * (1 - smooth(45, 46.5f, b)));   // 拖字的時候雪變淡，字才看得清楚

  if (b >= 13) {                                   // ③④ 聖誕樹
    if (noteNow && b >= 19 && b < 31 && litN < 13) { popK[litN] = 1; litN++; }   // 一個音亮一顆燈泡
    if (noteNow && b >= 24 && b < 31) ornShift++;   // 第二遍：燈泡跟著每個音換顏色
    if (b >= 22 && !starBurst) { starBurst = true; burst(8, 2, GOLD_HI, 16, 7, 0.9f); }   // 長音：星星亮起
    if (starBurst) starK = fminf(1, starK + dt * 4);
    if (b < 33) drawTree(b);
  }
  drawGround();

  if (b >= 7 && b < 13) {                          // ② 雪橇自己飛過去
    int sx = (int)floorf(WIDTH - (b - 7) / 6 * (WIDTH + SLEIGH_W));
    drawSleigh(sx, 2 + (int)roundf(sinf(showT * 6) * 0.6f));
  }
  if (b >= 31.5f && b < 46) {                      // ⑥⑦ 雪橇拖著金色 MERRY XMAS 飛過去
    const float TRAVEL = WIDTH + SLEIGH_W + 2 + 55;   // 雪橇＋繩子＋字的長度，全部飛出畫面
    int sx = (int)floorf(WIDTH - (b - 31.5f) / 14.5f * TRAVEL);
    int sy = 4 + (int)roundf(sinf(showT * 6) * 0.6f);
    drawSleigh(sx, sy);
    setPx(sx + SLEIGH_W, 7, mulC(GOLD, 0.6f), 1);   // 繩子
    setPx(sx + SLEIGH_W + 1, 7, mulC(GOLD, 0.6f), 1);
    drawText(sx + SLEIGH_W + 2, 5);
  }
  if (beatNow && b >= 46 && b < 50) {              // ⑧ 最後的長音：跟著拍子放煙火
    if (lastBeat == 46) burst(8, 7, GOLD, 34, 11, 1.4f);
    else burst(rnd(3, 13), rnd(3, 9), lastBeat == 47 ? RED_C : (lastBeat == 48 ? GREEN_C : GOLD_HI), 22, 8, 1.1f);
  }
  if (b >= 50 && !flourishDone) {                  // 收尾的快音：金色星星往上灑
    flourishDone = true;
    for (int k = 0; k < 24; k++) spark(rnd(2, 14), rnd(10, 15), rnd(-1, 1), rnd(-9, -4), k % 2 ? GOLD : WHITE_C, rnd(0.8f, 1.4f));
  }
  updateSparks(dt);
  drawSparks();

  stripShow(dt, b);
  beatK *= expf(-dt / 0.15f);
  for (int k = 0; k < 13; k++) popK[k] *= expf(-dt / 0.25f);

  if (b >= 51) {                                   // 慢慢暗回待機
    float k = 1 - smooth(51, END_BEAT, b);
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) fb[y][x] = mulC(fb[y][x], k);
  }
  if (b >= END_BEAT) { showing = false; coolT = COOLDOWN; idleT = 0; buzzer.off(); }
}

void drawIdleStar(float k) {                       // 待機：中間一顆小金星慢慢呼吸、偶爾閃一下
  float w = k * (0.35f + 0.25f * sinf(clk * 1.6f));
  if (random(1000) < 6) spark(rnd(6, 10), rnd(6, 10), 0, 0, GOLD_HI, 0.5f);
  for (int y = 7; y <= 8; y++)
    for (int x = 7; x <= 8; x++) addPx(x, y, GOLD, w);
  addPx(7, 6, GOLD, w * 0.45f); addPx(8, 6, GOLD, w * 0.45f); addPx(7, 9, GOLD, w * 0.45f); addPx(8, 9, GOLD, w * 0.45f);
  addPx(6, 7, GOLD, w * 0.45f); addPx(6, 8, GOLD, w * 0.45f); addPx(9, 7, GOLD, w * 0.45f); addPx(9, 8, GOLD, w * 0.45f);
}

void drawLoopIcon(float k) {                       // 按住按鈕 1：∞（輪播開）／∞ 加紅色斜線（輪播關）
  const char* LOOP_ICON[5] = {".##...##.", "#..#.#..#", "#...#...#", "#..#.#..#", ".##...##."};
  for (int r = 0; r < 5; r++)
    for (int c = 0; c < 9; c++)
      if (LOOP_ICON[r][c] == '#') setPx(3 + c, 5 + r, loopMode ? GOLD_HI : mulC(WHITE_C, 0.35f), k);
  if (!loopMode)
    for (int i = 0; i < 10; i++) setPx(3 + i, 2 + i, RED_C, k);
}
void drawSoundIcon(float k) {                      // 按鈕 2：音符（聲音開）／音符加紅色斜線（聲音關）
  const char* NOTE_ICON[8] = {"...XXX", "...X.X", "...X.X", "...X..", ".XXX..", "XXXX..", "XXXX..", ".XX..."};
  for (int r = 0; r < 8; r++)
    for (int c = 0; c < 6; c++)
      if (NOTE_ICON[r][c] == 'X') setPx(5 + c, 4 + r, soundOn ? GOLD_HI : mulC(WHITE_C, 0.35f), k);
  if (!soundOn)
    for (int i = 0; i < 10; i++) setPx(3 + i, 3 + i, RED_C, k);
}

// ───── 開門偵測：陀螺儀量花圈轉得多快 ─────
// 門繞著門軸轉，掛在門上的花圈跟著一起轉：一般開門每秒 50～170 度，慢慢開也有十幾度；掛著不動只有零點幾度的雜訊。
// （加速度在燈板平面內只量得到向心力：一般開門才 0.05～0.1 g，慢慢開幾乎是 0，分不出來，所以不用它。）
// 函式庫的 tilt 只給重力方向，這裡直接讀 IMU（QMI8658C）的陀螺儀：begin() 已經開好 I²C、設定成 ±512°/s。
#ifdef __EMSCRIPTEN__
bool readGyro(float w[3]) { return false; }
#else
uint8_t gyroAt = 0;                                // IMU 的 I²C 位址（setup() 裡找；找不到＝0：開門偵測關掉，聲音和按鈕照常）
bool imuRead(uint8_t reg, uint8_t* buf, int n) {
  Wire.beginTransmission(gyroAt);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint16_t)gyroAt, (size_t)n, true) != (size_t)n) return false;
  for (int i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}
void findGyro() {
  const uint8_t AT[2] = {0x6B, 0x6A};
  for (int i = 0; i < 2; i++) {
    gyroAt = AT[i];
    uint8_t id = 0;
    if (imuRead(0x00, &id, 1) && id == 0x05) return;   // 0x05＝QMI8658
  }
  gyroAt = 0;
}
bool readGyro(float w[3]) {                        // 三軸轉速（°/s）
  uint8_t b[6];
  if (!gyroAt || !imuRead(0x3B, b, 6)) return false;   // 陀螺儀 X、Y、Z，低位元組在前
  for (int i = 0; i < 3; i++) w[i] = (int16_t)(b[2 * i + 1] << 8 | b[2 * i]) / 64.0f;   // ±512°/s：1°/s＝64
  return true;
}
#endif

float spinOf(const float w[3], float dt) {         // 扣掉零點後，花圈轉得多快（°/s）；開機前 3 秒在量零點，回傳 0
  if (w[0] == 0 && w[1] == 0 && w[2] == 0) return 0;   // IMU 剛重新設定時會讀到全 0，不算
  float k = fminf(1, dt / (gZeroT < 3 ? 0.3f : 5.0f));   // 前 3 秒很快對準零點，之後慢慢跟著飄
  float s = 0;
  for (int i = 0; i < 3; i++) { float d = w[i] - gZero[i]; s += d * d; gZero[i] += d * k; }
  gZeroT += dt;
  return gZeroT < 3 ? 0 : sqrtf(s);
}

void setup() {
  begin();
  audio.sensitivity(1 - SOUND_LEVEL);              // 麥克風靈敏度：SOUND_LEVEL 越小，小聲也會演
#ifndef __EMSCRIPTEN__
  findGyro();
#endif
#ifdef __EMSCRIPTEN__
  brightness(0.45f);                               // 網頁預覽：0.075 暗到看不清楚，固定用 0.45
  strip.brightness(0.45f);
#else
  brightness(BRIGHT);
  strip.brightness(STRIP_BRIGHT);
#endif
  for (int k = 0; k < 30; k++) fl[k].on = false;
  for (int i = 0; i < STRIP; i++) tw[i] = 0;
}

void loop() {
  float now = seconds();
  float dt = fminf(0.1f, fmaxf(0.0f, now - lastSec));
  lastSec = now;
  clk += dt;

  // 觸發：門打開（花圈跟著門轉）、敲門或拍手、按鈕 1；預覽沒有感測器就自己定時演
  bool real = tilt.ready();
  float doorDps = 40 * powf(0.1f, DOOR_SENSE);     // 開門門檻（每秒幾度）：靈敏度 0 是 40、0.5 約 13、1 是 4
  float gyro[3], spin = 0;
  if (real && readGyro(gyro)) spin = spinOf(gyro, dt);
  bool canTrig = !showing && coolT <= 0;
  if (canTrig && spin > doorDps) startShow();
  else if (canTrig && SOUND_TRIGGER && audio.ready() && (audio.beat() || audio.level() > 0.6f)) startShow();
  if (button1.clicked() || button3.clicked()) {    // 按一下：演一次；輪播中按一下＝取消輪播
    if (loopMode) { loopMode = false; loopIconT = 1.5f; }
    else startShow();
  }
  if (button1.pressed() || button3.pressed()) {    // 按住五秒：一直輪播（演完休息 LOOP_REST 秒再演）
    holdT += dt;
    if (holdT >= 5 && !holdDone) { holdDone = true; loopMode = true; loopIconT = 1.5f; if (!showing) startShow(); }
  } else { holdT = 0; holdDone = false; }
  restT = showing ? 0 : restT + dt;
  if (loopMode && !showing && restT >= LOOP_REST) startShow();
  if (button2.clicked() || button4.clicked()) { soundOn = !soundOn; iconT = 1.5f; if (!soundOn) buzzer.off(); }
  if (!real && !showing) {
    idleT += dt;
    if (idleT > (firstDemo ? 1.0f : PREVIEW_EVERY)) { firstDemo = false; startShow(); }
  }
  if (coolT > 0) coolT -= dt;

  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) fb[y][x] = {0, 0, 0};
  for (int i = 0; i < STRIP; i++) sb[i] = {0, 0, 0};
  if (showing) {
    showT += dt;
    runShow(dt);
    float b = (showT - INTRO_SEC) / BEAT;
    if (b > 51) drawIdleStar(smooth(51, END_BEAT, b));
  } else {
    updateSparks(dt);
    drawSparks();
    drawIdleStar(1);
    stripIdle(1);
    for (int i = 0; i < STRIP; i++) tw[i] *= expf(-dt / 0.6f);
  }
  if (iconT > 0) { iconT -= dt; drawSoundIcon(clamp01(iconT / 0.4f)); }
  if (loopIconT > 0) { loopIconT -= dt; drawLoopIcon(clamp01(loopIconT / 0.4f)); }

  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) turnDot(x, y, rgb(toByte(fb[y][x].r), toByte(fb[y][x].g), toByte(fb[y][x].b)));
  for (int i = 0; i < STRIP; i++) strip.dot(i, rgb(toByte(sb[i].r), toByte(sb[i].g), toByte(sb[i].b)));
  show();                                          // 燈板和燈條一起送出
}
