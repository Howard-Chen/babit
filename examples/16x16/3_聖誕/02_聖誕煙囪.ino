// 聖誕煙囪
// @desc 掛在門上的聖誕花圈：開門就演聖誕老人卡在煙囪的小劇場。按鈕 1、3 演一次，2、4 開關聲音。
const int TURN = 0;                 // 方向：USB 朝左 0、上 90、右 180、下 270
const float DOOR_SENSE = 0.5f;      // 開門靈敏度 0～1，越大越敏感
const bool SOUND_TRIGGER = true;    // 敲門、拍手也會演
const float SOUND_LEVEL = 0.4f;     // 多大聲才會演 0～1，越小越敏感（原本 0.5）
const float COOLDOWN = 2;           // 演完幾秒內不再觸發
const float LOOP_REST = 3;          // 按住按鈕 1 五秒＝一直輪播；演完休息幾秒
const float BRIGHT = 0.075f;        // 燈板亮度，調高只有接充電器才變亮
const float STRIP_BRIGHT = 0.075f;  // 燈條亮度，同上
#define STRIP 60                    // 燈條幾顆燈（接 B）
const char* GREET1 = "MERRYXMAS";   // 第一段祝福：大寫英文或數字 9 個
const char* GREET2 = "HAPPY2027";   // 第二段祝福
const float BEAT = 0.42f;           // 一拍幾秒，越小越快
const int OCTAVE = -2;              // 歌升降幾個八度：1 高一個八度、-1 低一個八度
const float PREVIEW_EVERY = 45;     // 網頁預覽每幾秒自己演一次

#define PANEL 16
#include "BatoPixel.h"

#ifndef NOTE_C7                            // 舊版工具沒有蜂鳴器：不出聲的替身
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

struct C3 { float r, g, b; };                                  // 一個顏色（算的時候用小數）
struct Spark { float x, y, vx, vy, life, span; C3 c; };        // 星塵、煤灰：會飛、會慢慢暗掉
struct Flake { float x, y, vy, ph; bool on; };                 // 雪花
struct Puff { float x, y, vx, vy, life, span, r0, r1, k; bool fade; };   // 一團煙：往上飄、慢慢變大變淡（fade：開演時趕快淡掉）

// ───── 顏色 ─────
const C3 GOLD = {255, 165, 20};            // 金色
const C3 GOLD_HI = {255, 235, 150};        // 亮金色
const C3 WHITE_C = {255, 255, 255};
const C3 RED_C = {255, 35, 35};            // 字的紅
const C3 GREEN_C = {30, 220, 70};          // 字的綠
const C3 WARM = {255, 140, 50};            // 燈條待機的暖白
const C3 STAR_C = {220, 220, 180};         // 星星
const C3 SNOW_C = {200, 215, 255};         // 雪花
const C3 ROOF_SNOW = {225, 232, 255};      // 屋頂、煙囪根部的積雪
const C3 ROOF_C = {110, 28, 18};           // 屋瓦
const C3 ROOF2_C = {80, 20, 12};           // 屋瓦（暗的那一排）
const C3 BRICK_C = {190, 55, 35};          // 煙囪的紅磚
const C3 MORTAR_C = {105, 28, 18};         // 磚縫
const C3 BRICK_TOP = {215, 100, 72};       // 煙囪口的磚沿
const C3 SMOKE_C = {160, 156, 150};        // 煙：偏暖的灰（雪是偏藍的白，才分得開）
const C3 SMOKE_HI = {215, 210, 200};       // 煙團左上亮的地方
const C3 SMOKE_LO = {100, 97, 94};         // 煙團右下暗的地方
const C3 SOOT_C = {70, 70, 76};            // 煤灰
const C3 SANTA_C = {235, 20, 30};          // 聖誕老人的紅衣服
const C3 SKIN_C = {255, 180, 140};         // 臉
const C3 BOOT_C = {110, 58, 26};           // 靴子、皮帶（燈板上黑色不會亮，用深咖啡）
const C3 NOSE_C = {255, 80, 80};           // 紅鼻子
const C3 CHEEK_C = {255, 120, 110};        // 紅臉頰
const C3 BUTT_C = {140, 8, 14};            // 屁股中間的縫（暗紅）
const C3 MITT_C = {20, 120, 50};           // 綠手套
const C3 GIFT_BOX[4] = {{30, 170, 60}, {40, 90, 230}, {255, 170, 30}, {220, 30, 40}};   // 禮物盒：綠、藍、金、大紅
const C3 GIFT_RIB[4] = {{230, 30, 40}, {255, 255, 255}, {230, 30, 40}, {255, 180, 30}};  // 緞帶

// ───── 旋律：〈Jingle Bells〉副歌（1857 年，公有領域）──────────────────────
// C 大調、放在第 7 八度（2093～3136 Hz，這顆蜂鳴器最大聲的音域，聽起來像音樂盒）。
// 一個音：{音高, 長度}，長度 8＝一拍、4＝半拍、2＝四分之一拍。拍子 -2～0 是開場的雪橇鈴，第 1 小節從拍子 0 開始。
const int16_t SONG[][2] = {
  {NOTE_G7, 2}, {NOTE_C8, 2}, {NOTE_G7, 2}, {NOTE_C8, 2}, {NOTE_G7, 2}, {NOTE_C8, 2}, {NOTE_G7, 2}, {NOTE_C8, 2},   // 雪橇鈴
  {NOTE_E7, 8}, {NOTE_E7, 8}, {NOTE_E7, 16},                               // 第 1 小節（拍子 0）
  {NOTE_E7, 8}, {NOTE_E7, 8}, {NOTE_E7, 16},                               // 2
  {NOTE_E7, 8}, {NOTE_G7, 8}, {NOTE_C7, 12}, {NOTE_D7, 4},                 // 3
  {NOTE_E7, 32},                                                           // 4
  {NOTE_F7, 8}, {NOTE_F7, 8}, {NOTE_F7, 12}, {NOTE_F7, 4},                 // 5（拍子 16）
  {NOTE_F7, 8}, {NOTE_E7, 8}, {NOTE_E7, 8}, {NOTE_E7, 4}, {NOTE_E7, 4},    // 6
  {NOTE_E7, 8}, {NOTE_D7, 8}, {NOTE_D7, 8}, {NOTE_E7, 8},                  // 7
  {NOTE_D7, 16}, {NOTE_G7, 16},                                            // 8
  {NOTE_E7, 8}, {NOTE_E7, 8}, {NOTE_E7, 16},                               // 9（拍子 32）
  {NOTE_E7, 8}, {NOTE_E7, 8}, {NOTE_E7, 16},                               // 10
  {NOTE_E7, 8}, {NOTE_G7, 8}, {NOTE_C7, 12}, {NOTE_D7, 4},                 // 11
  {NOTE_E7, 32},                                                           // 12
  {NOTE_F7, 8}, {NOTE_F7, 8}, {NOTE_F7, 12}, {NOTE_F7, 4},                 // 13（拍子 48）
  {NOTE_F7, 8}, {NOTE_E7, 8}, {NOTE_E7, 8}, {NOTE_E7, 4}, {NOTE_E7, 4},    // 14
  {NOTE_G7, 8}, {NOTE_G7, 8}, {NOTE_F7, 8}, {NOTE_D7, 8},                  // 15
  {NOTE_C7, 32},                                                           // 16
  {NOTE_G7, 2}, {NOTE_C8, 2}, {NOTE_G7, 2}, {NOTE_C8, 2}};                 // 收尾的雪橇鈴（拍子 64～65）
const int SONG_LEN = sizeof(SONG) / sizeof(SONG[0]);
const float PITCH = OCTAVE >= 0 ? (float)(1 << OCTAVE) : 1.0f / (1 << -OCTAVE);   // OCTAVE 換成音高的倍數
const float END_BEAT = 66;                 // 第幾拍演完（雪橇鈴響完再停一拍，接回待機）

// ───── 劇本（第幾拍發生什麼，照旋律的音）──────────────────────
const float GIFT_AT[4] = {0, 2, 4, 6};                                // 第 1、2 小節：禮物斜斜的掉下來，在這幾拍碰到煙囪口；最後一個大禮物卡住
const float GIFT_FALL = 1.25f, GIFT_IN = 0.5f;                        // 禮物在畫面上掉幾拍、從煙囪口滑進去幾拍
const float SANTA_AT = 8, HIT_AT = 9, STUCK_AT = 9.5f, POP_AT = 14;   // 第 3、4 小節：掉下來、撞進禮物、卡住踢腳、噗
const float L1_AT[9] = {16, 17, 18, 19.5f, 20, 21, 22, 23, 23.5f};    // 第 5、6 小節：一個音噴一個字母
const float HOP1[4] = {24, 25, 26, 27};                               // 第 7 小節：字母跟著音符一個一個跳
const float PULSE1[2] = {28, 30};                                     // 第 8 小節：兩個長音，整排字亮一下
const float CLEAR1 = 32;                                              // 第 9 小節：字母被吸回煙囪
const float JUMP_AT = 44.85f, BOARD_AT = 45.1f;                       // 第 12 小節：空雪橇來接，蹲一下、跳出煙囪、坐上雪橇
const float L2_AT[9] = {48, 49, 50, 51.5f, 52, 53, 54, 55, 55.5f};    // 第 13、14 小節：第二段祝福
const float HOP2[4] = {56, 57, 58, 59};                               // 第 15 小節
const float PULSE2[2] = {60, 60};                                     // 第 16 小節的長音
const float CLEAR2 = 61;
const float FLY = 0.45f;                                              // 字母從煙囪飛到位置要幾拍

// ───── 圖案 ─────
// 雪橇（往左飛：前面是麋鹿，後面是聖誕老人和紅色雪橇）。A 鹿角、B 麋鹿、N 紅鼻子、K 韁繩、R 紅、G 金色滑板；
// 坐在雪橇上的聖誕老人：h 紅帽子、w 白毛邊和鬍子（雪橇來接他的時候是空的，他跳上去才畫）
const char* SLEIGH[6] = {
  ".A.A........w..",
  "NBB.......hh...",
  "..BBBBKKKKww.R.",
  "..BBBB...RRRRRR",
  "..B..B..GRRRRR.",
  ".........GGGGGG"};
const int SLEIGH_W = 15;
// 聖誕老人的顏色：K 靴子和皮帶、G 金色皮帶扣、W 白毛邊和鬍子、R 紅衣服、d 屁股中間的縫、S 臉、c 臉頰、o 眼睛、N 鼻子、M 綠手套
// 倒栽蔥的聖誕老人（7 格寬，從上到下：靴子、腿、屁股、皮帶、衣服、倒過來的鬍子、鼻子、眼睛、帽子）
const char* SANTA_FALL[14] = {"KK...KK", "KK...KK", "WW...WW", ".RR.RR.", ".RRdRR.", ".KKGKK.", ".RRRRR.",
                              "RRWWWRR", ".WWWWW.", ".WWNWW.", ".SoSoS.", ".WWWWW.", "..RRR..", "...RW.."};
// 站著的聖誕老人（7 格寬，從上到下：帽子（帽尖往右垂）、白毛邊、眼睛、鼻子和臉頰、鬍子、肩膀、衣服、皮帶、褲子、靴子）。
// 第 4 排是眼睛那一排，畫的時候會換成左看、右看、眨眼；從煙囪探出來的時候只看得到煙囪口以上的部分
const char* SANTA_UP[14] = {"...RRRW", "..RRRR.", ".RRRRR.", "WWWWWWW", "SSoSoSS", "cSSNSSc", "WWWWWWW",
                            "RWWWWWR", "RRWWWRR", "RRRWRRR", "KKKGKKK", "RRRWRRR", ".RR.RR.", ".KK.KK."};
// 禮物：X 盒子、R 緞帶；寬、高、從哪邊斜斜的掉過來（剛出現時離煙囪中線幾格，正的在右邊）、圖（由上往下）。
// 最後一個大禮物比煙囪口寬，會卡住
struct GiftArt { int8_t w, h, from; const char* rows[6]; };
const GiftArt GIFT_ART[4] = {
  {5, 5, 4, {".R.R.", "XXRXX", "RRRRR", "XXRXX", "XXRXX"}},                  // 綠盒紅緞帶（從右上來）
  {5, 6, -4, {"R...R", ".R.R.", "XXRXX", "RRRRR", "XXRXX", "XXRXX"}},        // 高高的藍盒、大蝴蝶結（從左上來）
  {7, 4, 4, {"..R.R..", "XXXRXXX", "RRRRRRR", "XXXRXXX"}},                    // 扁扁的金盒（從右上來）
  {11, 4, -3, {"...RR.RR...", "XXXXXRXXXXX", "RRRRRRRRRRR", "XXXXXRXXXXX"}}};  // 大紅盒：比煙囪口寬（從左上來）
// 3×5 的字：每個字 5 排、每排一個數字 0～7（左邊那點＝4、中間＝2、右邊＝1，加起來）
const char* const FONT3[36] = {
  "25755", "65656", "34443", "65556", "74647", "74644", "34553", "55755", "72227", "11152",    // A～J
  "55655", "44447", "57755", "65555", "25552", "65644", "25573", "65655", "34216", "72222",    // K～T
  "55557", "55552", "55775", "55255", "55222", "71247",                                        // U～Z
  "25552", "26227", "61247", "61216", "55711", "74616", "34652", "71222", "25252", "25316"};   // 0～9

const int CAP_Y = 11;                      // 煙囪口（磚沿）那一排；比它低的東西在煙囪裡，看不到
const int CH_L = 4, CH_R = 10;             // 煙囪磚身最左、最右那一行（磚沿再往外多一格：3～11）
const int CH_X = 7;                        // 煙囪的中線：禮物、聖誕老人都對準這一行
const float MOUTH_X = CH_X + 0.5f;         // 煙囪口的中間（小數座標，格子的正中間）
const int STUCK_TOP = CAP_Y - 6;           // 聖誕老人卡住的時候靴子在哪一排（皮帶剛好在磚沿上面）
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
int lastBeat = -99;                        // 上一個走過的拍子
float prevB = -99;                         // 上一格是第幾拍（判斷「這一格剛好走過某一拍」用）
float flashK = 0;                          // 燈條整圈閃一下（1 → 慢慢變 0）
C3 flashC = {0, 0, 0};
float wispT = 0;                           // 煙囪冒煙的計時
Spark sp[80];
int spN = 0;
Flake fl[24];
Puff pf[40];
int pfN = 0;
C3 fb[HEIGHT][WIDTH];                      // 這一格的畫面
C3 sb[STRIP];                              // 燈條這一格的顏色
float tw[STRIP];                           // 燈條每顆燈的閃光
float noteB = -99, noteLen = 1;            // 最近一個音：第幾拍開始、有幾拍長（燈條跟著旋律亮）
int noteN = 0, stripNoteN = 0;             // 唱了幾個音；燈條已經對過的音（新的音一來就閃一下）
float gZero[3] = {0, 0, 0};                // 陀螺儀的零點：不動也會讀到幾 °/s，還會隨溫度慢慢飄，用慢速平均跟著
float gZeroT = 0;                          // 零點量了幾秒（開機先量 3 秒，才開始偵測開門）
float lastSec = 0, clk = 0;

C3 mixC(C3 a, C3 b, float k) { return {a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k}; }
C3 mulC(C3 a, float k) { return {a.r * k, a.g * k, a.b * k}; }
float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
float smooth(float a, float b, float v) { float t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
float rnd(float a, float b) { return a + (b - a) * random(10001) / 10000.0f; }
int toByte(float v) { return v < 0 ? 0 : (v > 255 ? 255 : (int)(v + 0.5f)); }
bool passed(float b, float t) { return prevB < t && b >= t; }   // 這一格剛好走過第 t 拍

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

// ───── 星塵、煤灰 ─────
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

// ───── 煙 ─────
void puff(float x, float y, float vx, float vy, float span, float r0, float r1, float k) {
  if (pfN >= 40) return;
  pf[pfN++] = {x, y, vx, vy, span, span, r0, r1, k, false};
}
void puffBurst(int n, float spd, float k) {        // 煙囪口噴一團煙（往上、往兩邊）
  for (int i = 0; i < n; i++) {
    float a = rnd(-2.6f, -0.55f), s = spd * rnd(0.4f, 1.0f);
    puff(MOUTH_X + rnd(-2.0f, 2.0f), CAP_Y - 0.5f, cosf(a) * s, sinf(a) * s, rnd(0.8f, 1.4f), 0.6f, rnd(1.4f, 2.4f), k);
  }
}
int wispSide = 1;                                  // 煙一顆往左一點、一顆往右一點
void wisp(float dt) {                              // 待機的時候煙囪一直冒煙：一顆一顆像雲朵往上飄、越飄越大（演出的時候不冒）
  wispT += dt;
  if (wispT < 1.5f) return;
  wispT = 0;
  wispSide = -wispSide;
  puff(MOUTH_X + 0.6f * wispSide, CAP_Y - 1.0f, 0.15f * wispSide + 0.2f, -2.6f, 4.2f, 0.9f, 2.3f, 1.0f);
}
void updatePuffs(float dt) {
  for (int i = 0; i < pfN;) {
    Puff &p = pf[i];
    p.life -= dt;
    if (p.fade) p.k -= dt * 2.5f;                  // 開演了：待機冒的煙 0.4 秒內淡掉
    if (p.life <= 0 || p.k <= 0) { p = pf[--pfN]; continue; }
    float drag = expf(-dt * 1.2f);
    p.vx = p.vx * drag + 0.5f * dt;                // 風往右吹
    p.vy = p.vy * drag - 3.0f * dt;                // 熱煙一直往上飄（最後每秒大約 2.5 格）
    p.x += p.vx * dt; p.y += p.vy * dt;
    i++;
  }
}
void drawPuffs() {                                 // 每一團煙是一顆圓圓的雲朵：左上亮、右下暗，越飄越大，最後慢慢淡掉
  for (int i = 0; i < pfN; i++) {
    Puff &p = pf[i];
    float age = 1 - p.life / p.span, r = p.r0 + (p.r1 - p.r0) * age;   // 越飄越大
    float a = p.k * clamp01((1 - age) / 0.35f);    // 最後 35% 的時間慢慢淡掉
    for (int y = (int)floorf(p.y - r - 1); y <= (int)ceilf(p.y + r + 1); y++) {
      if (y >= CAP_Y) continue;                    // 煙從煙囪口後面冒出來，不蓋住磚沿
      for (int x = (int)floorf(p.x - r - 1); x <= (int)ceilf(p.x + r + 1); x++) {
        float dx = x + 0.5f - p.x, dy = y + 0.5f - p.y;
        float cov = clamp01(r + 0.5f - sqrtf(dx * dx + dy * dy));
        if (cov <= 0) continue;
        float rr = fmaxf(r, 0.6f);
        float lit = clamp01(-(dx * 0.5f + dy * 0.85f) / rr);          // 左上亮
        float dark = clamp01((dx * 0.4f + dy * 0.9f) / rr - 0.2f);    // 右下暗
        setPx(x, y, mixC(mixC(SMOKE_C, SMOKE_HI, lit), SMOKE_LO, dark), cov * a);
      }
    }
  }
}

// ───── 下雪 ─────
int roofEdge(int x) { return (int)roundf(15 - 0.2f * x); }   // 屋頂邊緣：從左下往右上斜
void updateSnow(float dt, float rate) {
  if (random(1000) < rate * dt * 1000)
    for (int k = 0; k < 24; k++)
      if (!fl[k].on) { fl[k] = {rnd(0, WIDTH), -0.5f, rnd(1.6f, 3.0f), rnd(0, 6.28f), true}; break; }
  for (int k = 0; k < 24; k++) {
    Flake &f = fl[k];
    if (!f.on) continue;
    f.y += f.vy * dt;
    f.x += sinf(clk * 2 + f.ph) * 0.6f * dt;       // 左右飄
    int col = (int)constrain(f.x, 0.0f, WIDTH - 1.0f);
    float floorY = (col >= CH_L - 1 && col <= CH_R + 1) ? CAP_Y : roofEdge(col);
    if (f.y > floorY - 0.3f) f.on = false;         // 落到屋頂、煙囪上就不見（屋頂本來就積著雪）
  }
}
void drawSnow() {
  for (int k = 0; k < 24; k++) if (fl[k].on) addSoft(fl[k].x, fl[k].y, SNOW_C, 0.85f);
}

// ───── 屋頂和煙囪 ─────
void drawScene() {
  const int8_t STARS[5][2] = {{1, 2}, {5, 0}, {10, 1}, {14, 3}, {12, 6}};
  for (int k = 0; k < 5; k++) addPx(STARS[k][0], STARS[k][1], STAR_C, 0.22f + 0.18f * sinf(clk * 2.3f + k * 2.1f));
  for (int x = 0; x < WIDTH; x++) {                // 屋頂：邊緣積雪，下面是瓦片
    int e = roofEdge(x);
    setPx(x, e, ROOF_SNOW, 1);
    for (int y = e + 1; y < HEIGHT; y++) setPx(x, y, (y + x / 3) % 2 ? ROOF_C : ROOF2_C, 1);
  }
  for (int x = CH_L; x <= CH_R; x++)               // 煙囪：一直砌進屋頂，橫的磚縫、上下錯開的直縫
    for (int y = CAP_Y + 1; y <= roofEdge(x); y++) {
      int row = y - CAP_Y - 1;
      bool mortar = row % 2 == 1 || (x - CH_L + (row / 2 % 2 ? 2 : 0)) % 4 == 3;
      setPx(x, y, mortar ? MORTAR_C : BRICK_C, 1);
    }
  for (int x = CH_L - 1; x <= CH_R + 1; x++) setPx(x, CAP_Y, BRICK_TOP, 1);   // 煙囪口的磚沿
}

// ───── 禮物 ─────
void drawGifts(float b) {
  for (int k = 0; k < 4; k++) {
    const GiftArt &g = GIFT_ART[k];
    bool big = k == 3;
    float t = b - GIFT_AT[k], bottom, side = 0;   // bottom＝盒子最下面那一排在哪、side＝離煙囪中線幾格
    if (t < -GIFT_FALL) continue;
    if (t < 0) {                                   // 斜斜的掉下來：往旁邊等速飄、往下越掉越快，剛好在那個音對準煙囪口
      float u = (t + GIFT_FALL) / GIFT_FALL;
      bottom = -1 + (big ? CAP_Y : CAP_Y + 1) * (0.35f * u + 0.65f * u * u);
      side = g.from * (1 - u);
    }
    else if (!big) { if (t > GIFT_IN) continue; float u = t / GIFT_IN; bottom = CAP_Y + g.h * u * u; }   // 在煙囪口頓一下，再滑進去
    else if (b < HIT_AT) bottom = CAP_Y - 1 - (fmodf(b, 0.5f) < 0.12f ? 1 : 0);                         // 大禮物比煙囪口寬，卡住了，一直抖
    else { if (b > HIT_AT + 0.25f) continue; bottom = CAP_Y - 1 + (g.h + 1) * (b - HIT_AT) / 0.25f; }   // 被聖誕老人撞進去
    int top = (int)floorf(bottom) - g.h + 1, x0 = CH_X - g.w / 2 + (int)roundf(side);
    for (int r = 0; r < g.h; r++)
      for (int c = 0; c < g.w; c++) {
        char ch = g.rows[r][c];
        int y = top + r;
        if (ch == '.' || y >= CAP_Y) continue;    // 進了煙囪就看不到
        setPx(x0 + c, y, ch == 'X' ? GIFT_BOX[k] : GIFT_RIB[k], 1);
      }
  }
}

// ───── 聖誕老人 ─────
C3 santaC(char ch) {
  switch (ch) {
    case 'K': return BOOT_C;
    case 'G': return GOLD;
    case 'W': return WHITE_C;
    case 'R': return SANTA_C;
    case 'd': return BUTT_C;
    case 'S': return SKIN_C;
    case 'c': return CHEEK_C;
    case 'N': return NOSE_C;
    case 'M': return MITT_C;
    default:  return {0, 0, 0};                    // o：眼睛，不亮
  }
}
void santaPx(int x, int y, char ch) {              // 聖誕老人的一格（進了煙囪就看不到）
  if (ch != '.' && y < CAP_Y) setPx(x, y, santaC(ch), 1);
}
void drawStuck(int x0, int ty, int kick, int lift) {   // 卡在煙囪口：屁股、皮帶和兩條腿露在外面；kick＝踢起來的那隻腳（0 左、1 右、-1 沒有）
  const char* HIP[2] = {".RRdRR.", ".KKGKK."};
  for (int r = 0; r < 2; r++)
    for (int c = 0; c < 7; c++) santaPx(x0 + c, ty + 4 + r, HIP[r][c]);
  for (int side = 0; side < 2; side++) {
    int up = kick == side ? lift : 0;              // 踢起來的那隻腳整隻往上 lift 格
    int bx = x0 + (side ? 5 : 0), lx = x0 + (side ? 4 : 1);   // 靴子、大腿在哪一行（兩條腿張開成 V 字）
    for (int c = 0; c < 2; c++) {
      santaPx(bx + c, ty - up, 'K');
      santaPx(bx + c, ty + 1 - up, 'K');
      santaPx(bx + c, ty + 2 - up, 'W');
      for (int y = ty + 3 - up; y <= ty + 2; y++) santaPx(bx + c, y, 'R');   // 腿伸長了，補上褲管
      santaPx(lx + c, ty + 3, 'R');
    }
  }
}
void drawSantaFall(float b) {                      // 兩手亂揮掉下來、撞進禮物、卡在煙囪口踢腳、噗一聲掉下去
  if (b < SANTA_AT || b > POP_AT + 0.3f) return;
  int x0 = CH_X - 3;                               // 7 格寬，對準煙囪中線
  if (b < STUCK_AT) {
    float top;
    const int hitTop = CAP_Y - 18;                 // 撞上大禮物的時候（帽子剛好碰到禮物上緣）
    if (b < HIT_AT) { float u = (b - SANTA_AT) / (HIT_AT - SANTA_AT); top = -14 + (hitTop + 14) * (0.4f * u + 0.6f * u * u); }   // 倒過來的帽子先進畫面，剛好在那個音撞上大禮物
    else { float u = (b - HIT_AT) / (STUCK_AT - HIT_AT); top = hitTop + (STUCK_TOP - hitTop) * (1 - (1 - u) * (1 - u)); }       // 滑進煙囪，卡在屁股
    int ty = (int)roundf(top);
    for (int r = 0; r < 14; r++)
      for (int c = 0; c < 7; c++) santaPx(x0 + c, ty + r, SANTA_FALL[r][c]);
    int flap = (int)(b * 8) % 2;                   // 兩隻手在頭旁邊亂揮（從肩膀往下：袖子、白袖口、手套）
    for (int r = 0; r < 3; r++) {
      char ch = "RWM"[r];
      santaPx(x0 - 1 - (flap && r == 2), ty + 8 + r + flap, ch);
      santaPx(x0 + 7 + (flap && r == 2), ty + 8 + r + flap, ch);
    }
    return;
  }
  int ty = STUCK_TOP, kick = -1, sway = 0, lift = 1;
  if (b < POP_AT) {                                // 卡住：兩隻腳跟著拍子輪流伸長（一拍換一隻，先伸一格再伸到兩格）
    kick = (int)floorf(b) % 2;
    lift = b - floorf(b) < 0.25f ? 1 : 2;
  } else ty += (int)((b - POP_AT) / 0.25f * 7);    // 噗：掉下去
  drawStuck(x0 + sway, ty, kick, lift);
}
float headTop(float b) {                           // 探出來的聖誕老人：帽頂在哪一排（CAP_Y＝還在煙囪裡）
  if (b < 33) return CAP_Y;
  if (b < 34) return CAP_Y - 4 * smooth(33, 33.3f, b);            // 紅帽子探出來
  if (b < 35) return CAP_Y - 4 + 4 * smooth(34, 34.25f, b);       // 縮回去
  if (b < 36) return CAP_Y - 4 * smooth(35, 35.25f, b);           // 又探出來
  if (b < 44.6f) return CAP_Y - 4 - 5 * smooth(36, 36.35f, b);    // 頭和肩膀都冒出來，趴在煙囪口
  if (b < JUMP_AT) return CAP_Y - 9 + smooth(44.6f, 44.75f, b);   // 蹲一下
  return CAP_Y - 8 - 16 * smooth(JUMP_AT, BOARD_AT, b);           // 跳上雪橇
}
void armUp(int side, bool wide) {                  // 從煙囪口舉起來的一隻手（side 0 左、1 右；wide＝往外張開）
  int s = side ? 1 : -1, x = side ? CH_R + 2 : CH_L - 2;
  santaPx(x, CAP_Y - 1, 'R');
  santaPx(x, CAP_Y - 2, 'R');
  santaPx(x + (wide ? s : 0), CAP_Y - 3, 'W');
  santaPx(x + (wide ? s : 0), CAP_Y - 4, 'M');
}
void drawSantaHead(float b) {
  if (b < 33 || b >= BOARD_AT) return;
  int x0 = CH_X - 3, ty = (int)roundf(headTop(b));
  int look = (b >= 37 && b < 38) ? -1 : ((b >= 38 && b < 39.2f) ? 1 : 0);   // 左看、右看
  bool blink = b >= 39.2f && b < 39.45f;                                     // 眨眼
  for (int r = 0; r < 14; r++)                     // 煙囪口以下的部分看不到；跳出煙囪的時候整個人都出來了
    for (int c = 0; c < 7; c++) {
      char ch = SANTA_UP[r][c];
      if (r == 4) ch = (!blink && (c == 2 + look || c == 4 + look)) ? 'o' : 'S';
      santaPx(x0 + c, ty + r, ch);
    }
  if (b >= JUMP_AT) return;
  bool out = ty <= CAP_Y - 2;                      // 頭探出來了，手才抓上煙囪口
  bool raise = b >= 40 && b < 44.6f;               // 舉起雙手，然後右手揮手
  if (raise) {
    bool wave = b >= 41 && (int)((b - 41) * 4) % 2 == 1;
    if (b < 41) armUp(0, true);
    armUp(1, b < 41 || !wave);
  }
  if (out && (!raise || b >= 41)) { santaPx(CH_L - 2, CAP_Y - 1, 'M'); santaPx(CH_L - 1, CAP_Y - 1, 'M'); }   // 左手抓著煙囪口
  if (out && !raise) { santaPx(CH_R + 1, CAP_Y - 1, 'M'); santaPx(CH_R + 2, CAP_Y - 1, 'M'); }                // 右手抓著煙囪口
}

// ───── 雪橇 ─────
C3 sleighColor(char ch) {
  switch (ch) {
    case 'A': return {200, 130, 60};
    case 'B': return {190, 95, 30};
    case 'N': return {255, 20, 10};
    case 'K': return {230, 170, 50};
    case 'R': case 'h': return {235, 20, 30};
    case 'w': return {255, 255, 255};
    default:  return {255, 175, 30};
  }
}
void sleighPass(float b, float from, float dur, int sy, float boardAt) {   // 雪橇從右邊飛到左邊，後面拖一串星塵；boardAt 之前雪橇上沒有人
  if (b < from || b > from + dur) return;
  int sx = (int)floorf(WIDTH - (b - from) / dur * (WIDTH + SLEIGH_W));
  sy += (int)roundf(sinf(showT * 9) * 0.5f);
  for (int r = 0; r < 6; r++)
    for (int c = 0; c < SLEIGH_W; c++) {
      char ch = SLEIGH[r][c];
      if (ch == '.' || ((ch == 'h' || ch == 'w') && b < boardAt)) continue;
      setPx(sx + c, sy + r, sleighColor(ch), 1);
    }
  if (random(100) < 55) spark(sx + SLEIGH_W - 1 + rnd(0, 1), sy + rnd(3, 6), rnd(1, 3), rnd(-0.6f, 0.6f), GOLD, rnd(0.4f, 0.9f));
}

// ───── 祝福的字 ─────
const char* glyph3(char ch) {
  if (ch >= 'A' && ch <= 'Z') return FONT3[ch - 'A'];
  if (ch >= '0' && ch <= '9') return FONT3[26 + ch - '0'];
  return "00000";
}
bool g3on(const char* g, int r, int c) { return ((g[r] - '0') >> (2 - c)) & 1; }
void slotOf(int i, int &x, int &y) {               // 第 i 個字排在哪：上排字貼字，下排字中間空一格
  if (i < 5) { x = 1 + 3 * i; y = 2; } else { x = 1 + 4 * (i - 5); y = 9; }
}
C3 letterC(int which, int i) {                     // 第一段：上排紅綠交錯、下排金色；第二段：上排金白交錯、下排金色
  if (i >= 5) return GOLD;
  if (which == 0) return i % 2 ? GREEN_C : RED_C;
  return i % 2 ? WHITE_C : GOLD;
}
void drawGlyphF(const char* g, float cx, float cy, float s, C3 c) {   // 縮放中的字：中心在 (cx, cy)，一點有 s 格大
  for (int y = (int)floorf(cy - 2.5f * s); y <= (int)ceilf(cy + 2.5f * s); y++)
    for (int x = (int)floorf(cx - 1.5f * s); x <= (int)ceilf(cx + 1.5f * s); x++) {
      float cov = 0;
      for (int r = 0; r < 5; r++)
        for (int k = 0; k < 3; k++) {
          if (!g3on(g, r, k)) continue;
          float ax = cx + (k - 1.5f) * s, ay = cy + (r - 2.5f) * s;   // 這一點的左上角
          float ox = fminf(x + 1, ax + s) - fmaxf(x, ax), oy = fminf(y + 1, ay + s) - fmaxf(y, ay);
          if (ox > 0 && oy > 0) cov += ox * oy;
        }
      if (cov > 0) setPx(x, y, c, clamp01(cov));
    }
}
void drawGreeting(int which, float b) {            // 一個音噴一個字母、飛到位置排好；跟著音符跳；最後被吸回煙囪
  const char* text = which == 0 ? GREET1 : GREET2;
  const float* at = which == 0 ? L1_AT : L2_AT;
  const float* hop = which == 0 ? HOP1 : HOP2;
  const float* pulse = which == 0 ? PULSE1 : PULSE2;
  float clearAt = which == 0 ? CLEAR1 : CLEAR2;
  for (int i = 0; i < 9 && text[i]; i++) {
    float t = b - at[i];
    if (t < 0) continue;
    const char* g = glyph3(text[i]);
    int sx, sy;
    slotOf(i, sx, sy);
    float tx = sx + 1.5f, ty = sy + 2.5f;          // 排好的位置（字的中心）
    C3 c = letterC(which, i);
    float ct = b - clearAt - i * 0.04f;
    if (ct >= 0) {                                 // 被吸回煙囪：越來越快、越來越小
      float e = ct / 0.5f;
      if (e >= 1) continue;
      e = e * e;
      drawGlyphF(g, tx + (MOUTH_X - tx) * e, ty + (CAP_Y - 0.5f - ty) * e, 1 - 0.7f * e, c);
    } else if (t < FLY) {                          // 從煙囪口噴出來，畫一道弧線飛到位置，一邊放大
      float u = t / FLY, e = 1 - (1 - u) * (1 - u);
      float px = MOUTH_X, py = CAP_Y - 1.0f, mx = (px + tx) / 2, my = fminf(py, ty) - 4;
      float qx = (1 - e) * (1 - e) * px + 2 * (1 - e) * e * mx + e * e * tx;
      float qy = (1 - e) * (1 - e) * py + 2 * (1 - e) * e * my + e * e * ty;
      drawGlyphF(g, qx, qy, 0.35f + 0.65f * e, c);
    } else {                                       // 排好了：一格一點，清清楚楚
      int dy = 0;
      for (int h = 0; h < 4; h++) { float ht = b - hop[h] - i * 0.06f; if (ht >= 0 && ht < 0.22f) dy = -1; }   // 跟著音符一個一個跳
      float glow = clamp01(1 - (t - FLY) / 0.3f);  // 剛落地亮一下
      for (int p = 0; p < 2; p++) if (b >= pulse[p]) glow = fmaxf(glow, 0.6f * clamp01(1 - (b - pulse[p]) / 0.6f));   // 長音整排亮一下
      for (int r = 0; r < 5; r++)
        for (int k = 0; k < 3; k++)
          if (g3on(g, r, k)) setPx(sx + k, sy + r + dy, mixC(c, WHITE_C, glow * 0.7f), 1);
    }
  }
}
float sceneK(float b) {                            // 排字的時候後面全部淡出，畫面只剩字；字吸回煙囪的時候再淡入
  float a = smooth(15.2f, 16.2f, b) * (1 - smooth(31.8f, 32.6f, b));
  float c = smooth(47.2f, 48.2f, b) * (1 - smooth(60.8f, 61.6f, b));
  return 1 - fmaxf(a, c);
}
float snowRate(float b) {                          // 每秒下幾片雪：掉禮物的時候不下、排字的時候不下
  if (b < GIFT_AT[3]) return 0;
  if ((b >= 15.2f && b < 32.6f) || (b >= 47.2f && b < 61.6f)) return 0;
  return b < 61 ? 4 : 1.5f;
}

// ───── 燈條：跟著旋律亮 ─────
float noteEnv(float b) {                           // 這個音現在多亮：一開始 1，短音很快暗下來、長音慢慢暗
  float age = b - noteB;
  if (age < 0) return 0;
  return expf(-age / fmaxf(0.12f, 0.4f * noteLen));
}
bool newNote() {                                   // 這一格剛好來了一個新的音（每格只問一次）
  if (noteN == stripNoteN) return false;
  stripNoteN = noteN;
  return true;
}
int giftNow(float b) {                             // 現在在掉的是第幾個禮物
  for (int k = 0; k < 4; k++) if (b < GIFT_AT[k] + GIFT_IN) return k;
  return 3;
}
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
void stripFlash(C3 c) { flashC = c; flashK = 1; }   // 整圈閃一下
void stripIdle() {                                 // 待機：淡淡的暖白，一直有幾顆像雪花閃一下
  if (random(1000) < 75) tw[random(STRIP)] = 0.6f;
  for (int i = 0; i < STRIP; i++) sb[i] = mulC(WARM, 0.3f);
}
void stripPaint(float pos, C3 c, float k) {        // 燈條上小數位置的一點：蓋上去（不是疊加），後畫的光在上面
  if (pos < 0 || pos > STRIP - 1) return;
  int i0 = (int)pos, i1 = i0 + 1 < STRIP ? i0 + 1 : i0;
  float f = pos - i0;
  sb[i0] = mixC(sb[i0], c, k * (1 - f));
  sb[i1] = mixC(sb[i1], c, k * f);
}
void stripRun(float u, float to, C3 c, int len) {  // 一道光從燈條頭（第 0 顆）跑到第 to 顆：u 從 0 到 1
  if (u < 0 || u >= 1) return;
  float pos = u * to;
  for (int j = len - 1; j >= 0; j--) stripPaint(pos - j, c, powf(1 - (float)j / len, 1.5f));
  stripPaint(pos, mixC(c, WHITE_C, 0.4f), 1);      // 光頭帶一點白，跑起來比較亮
}
void stripGiftRuns(float b) {                      // 禮物掉下來的時候：禮物顏色的光從頭跑到尾，禮物碰到煙囪口時剛好跑到尾巴
  for (int k = 0; k < 4; k++) stripRun((b - GIFT_AT[k] + GIFT_FALL) / GIFT_FALL, STRIP - 1, GIFT_BOX[k], 12);
}
float runB[4] = {-99, -99, -99, -99};              // 探頭的時候每個音放一道光：第幾拍出發
int runI = 0;
void stripJingle(bool hit) {                       // 雪橇鈴：每一聲叮，整圈隨便亮起一串星光
  if (hit) for (int j = 0; j < 8; j++) tw[random(STRIP)] = 1;
}
void stripStripes(float pos, int w, float k) {     // 紅白條紋（聖誕老人的顏色）
  for (int i = 0; i < STRIP; i++) {
    bool red = ((int)floorf((i + pos) / w)) % 2 == 0;
    sb[i] = mulC(red ? SANTA_C : WHITE_C, red ? k : k * 0.7f);
  }
}
void stripWrap(int k, float pos, float bright) {   // 禮物的包裝紙：盒子的顏色，每 5 顆一條緞帶
  for (int i = 0; i < STRIP; i++) {
    bool rib = ((int)floorf(i + pos) % 5 + 5) % 5 == 0;
    sb[i] = mulC(rib ? GIFT_RIB[k] : GIFT_BOX[k], bright);
  }
}
void stripLetters(int which, float b, float e) {   // 排字：字母飛出來，同色的光從頭跑到尾；落地後整條換成它的顏色，跟著旋律亮
  const float* at = which == 0 ? L1_AT : L2_AT;
  const float* hop = which == 0 ? HOP1 : HOP2;
  int last = -1;                                   // 最後落地的字母（燈條不是整圈，不把字母對到燈條上的位置）
  for (int k = 0; k < 9; k++) if (b >= at[k] + FLY) last = k;
  C3 base = last < 0 ? mulC(WARM, 0.15f + 0.25f * e) : mulC(letterC(which, last), 0.3f + 0.5f * e);
  for (int i = 0; i < STRIP; i++) sb[i] = base;
  for (int k = 0; k < 9; k++)
    if (b >= at[k] && b < at[k] + FLY) stripRun((b - at[k]) / FLY, STRIP - 1, letterC(which, k), 8);
  for (int h = 0; h < 4; h++)                      // 字跟著音符跳的時候，白光跑一圈
    if (b >= hop[h] && b < hop[h] + 1) stripComet((b - hop[h]) * STRIP, WHITE_C, 6, 0.8f);
}
void stripShow(float b) {                          // 燈條跟著旋律：每個音一開始整圈亮一下、花樣走一步；顏色跟著故事
  float e = noteEnv(b);
  bool hit = newNote();
  if (b < 0) {                                     // 開場：跟著雪橇，金光繞一圈；雪橇鈴每叮一聲閃一串星光
    stripIdle();
    stripComet((b + 2) / 2 * STRIP, GOLD, 10, 1);
    stripJingle(hit);
    stripGiftRuns(b);
  } else if (b < SANTA_AT) {                       // 禮物：現在掉的那個禮物的包裝紙，每個音轉一格、亮一下；掉下來的禮物從頭跑到尾
    stripWrap(giftNow(b), noteN * 2, 0.15f + 0.6f * e);
    stripGiftRuns(b);
  } else if (b < POP_AT + 0.1f) {                  // 聖誕老人：紅白條紋，一個音走一格；卡住踢腳的長音越轉越快
    float spin = b < 12 ? 0 : (b - 12) * (b - 12) * 3;
    stripStripes(noteN * 3 + spin, 3, 0.22f + 0.6f * e);
    stripRun((b - SANTA_AT) / (HIT_AT - SANTA_AT), STRIP - 1, SANTA_C, 14);   // 掉下來：紅光從頭跑到尾，撞上禮物
  } else if (b < L1_AT[0]) {                       // 噗：整圈白光，慢慢暗
    stripIdle();
  } else if (b < CLEAR1 + 0.6f) {
    stripLetters(0, b, e);
  } else if (b < 44) {                             // 探頭、揮手：淡淡的紅白條紋，每個音放一道紅（白）光從頭跑到尾
    stripStripes(noteN * 4, 4, 0.1f + 0.25f * e);
    if (hit && b >= 33) { runB[runI] = b; runI = (runI + 1) % 4; }
    for (int k = 0; k < 4; k++) stripRun(b - runB[k], STRIP - 1, (k % 2) ? WHITE_C : SANTA_C, 10);
  } else if (b < L2_AT[0]) {                       // 雪橇把聖誕老人接走：金光繞一圈
    stripIdle();
    if (b < 46) stripComet((b - 44) * STRIP / 1.6f, GOLD, 12, 1);
  } else if (b < CLEAR2 + 0.6f) {
    stripLetters(1, b, e);
  } else if (b < 64) {                             // 最後的雪橇：金光繞一圈、星塵一閃一閃
    stripIdle();
    stripComet((b - 61.5f) / 2 * STRIP, GOLD, 14, 1);
    if (random(100) < 40) tw[random(STRIP)] = 1;
  } else {                                         // 收尾的雪橇鈴
    stripIdle();
    stripJingle(hit);
  }
}
void stripFinish(float dt) {                       // 疊上整圈的閃光和小閃光，再慢慢退掉
  for (int i = 0; i < STRIP; i++) {
    sb[i] = mixC(sb[i], flashC, flashK * 0.85f);
    sb[i] = mixC(sb[i], WHITE_C, tw[i] * 0.7f);
    tw[i] *= expf(-dt / 0.25f);
  }
  flashK *= expf(-dt / 0.2f);
}

// ───── 演出 ─────
void startShow() {
  showing = true; showT = 0; songI = 0; songAt = 0; lastBeat = -99; prevB = -99;
  buzzer.off();
  for (int i = 0; i < pfN; i++) pf[i].fade = true;   // 煙囪只有待機才冒煙：開演就讓煙淡掉
  for (int k = 0; k < 24; k++) fl[k].on = false;     // 掉禮物的時候不下雪
}

void music(float b) {                              // 照拍子叫蜂鳴器唱
  float u = (b + 2) * 8;                           // 從開場的雪橇鈴算起，現在在第幾個「八分之一拍」
  while (songI < SONG_LEN && u >= songAt) {
    int f = SONG[songI][0], len = SONG[songI][1];
    bool late = songI + 1 < SONG_LEN && u >= songAt + len;   // 這一格已經跨過整個音（卡頓）：跳過不唱
    if (!late && soundOn && f > 0) buzzer.beep(f * PITCH, len * BEAT / 8 * (len >= 8 ? 0.9f : 0.8f));
    if (!late) { noteB = songAt / 8.0f - 2; noteLen = len / 8.0f; noteN++; }   // 燈條跟著這個音亮（聲音關掉也照樣亮）
    songAt += len;
    songI++;
  }
}

void events(float b) {                             // 剛好走到某一拍時發生一次的事：噴煙、燈條閃光
  // 煙囪只有待機才冒煙；演出中只有聖誕老人撞進去、噗這兩下會噴一團煙
  for (int k = 0; k < 4; k++)
    if (passed(b, GIFT_AT[k])) stripFlash(GIFT_BOX[k]);                            // 禮物碰到煙囪口
  if (passed(b, HIT_AT)) { puffBurst(5, 4, 0.7f); stripFlash(GIFT_BOX[3]); }        // 撞進去
  if (passed(b, POP_AT + 0.12f)) {                 // 噗！
    puffBurst(14, 6, 0.9f);
    burst(MOUTH_X, CAP_Y - 1, SOOT_C, 14, 8, 1.1f);
    stripFlash(WHITE_C);
  }
  for (int i = 0; i < 9; i++)                      // 字母落地：燈條閃幾顆
    if (passed(b, L1_AT[i] + FLY) || passed(b, L2_AT[i] + FLY))
      for (int j = 0; j < 3; j++) tw[random(STRIP)] = 1;
  if (passed(b, 44)) stripFlash(GOLD);                                                // 空雪橇衝過來（長音的第一下）
  if (passed(b, 64)) stripFlash(GOLD_HI);                                             // 收尾的雪橇鈴
  if (passed(b, BOARD_AT)) burst(MOUTH_X, 2, GOLD_HI, 12, 6, 0.8f);                  // 坐上雪橇
  for (int p = 0; p < 2; p++)
    if (passed(b, PULSE1[p]) || (p == 0 && passed(b, PULSE2[p]))) stripFlash(GOLD);
}

void runShow(float dt) {
  float b = showT / BEAT - 2;                      // 第幾拍（開場的雪橇鈴是 -2～0）
  music(b);
  if (b >= 0 && (int)floorf(b) != lastBeat) lastBeat = (int)floorf(b);
  events(b);

  updateSnow(dt, snowRate(b));
  drawScene();
  drawSnow();
  updatePuffs(dt);
  drawPuffs();                                     // 煙畫在禮物和聖誕老人後面，他們才不會被煙染成粉紅色
  drawGifts(b);
  drawSantaFall(b);
  drawSantaHead(b);
  sleighPass(b, -2, 2, 1, -99);                    // 開場：雪橇飛過
  sleighPass(b, 44.2f, 1.4f, 0, BOARD_AT);         // 第 12 小節：空雪橇衝過來，聖誕老人跳上去被接走
  sleighPass(b, 61.5f, 2, 1, -99);                 // 最後的長音：飛走
  updateSparks(dt);
  drawSparks();
  float k = sceneK(b);
  if (k < 1)
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) fb[y][x] = mulC(fb[y][x], k);
  if (b >= L1_AT[0] && b < CLEAR1 + 1) drawGreeting(0, b);
  if (b >= L2_AT[0] && b < CLEAR2 + 1) drawGreeting(1, b);

  stripShow(b);
  prevB = b;
  if (b >= END_BEAT) { showing = false; coolT = COOLDOWN; idleT = 0; buzzer.off(); }
}

void runIdle(float dt) {                           // 待機：屋頂、煙囪冒煙、偶爾飄雪
  updateSnow(dt, 0.6f);
  drawScene();
  drawSnow();
  wisp(dt);
  updatePuffs(dt);
  drawPuffs();
  updateSparks(dt);
  drawSparks();
  stripIdle();
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
  for (int k = 0; k < 24; k++) fl[k].on = false;
  for (int i = 0; i < STRIP; i++) tw[i] = 0;
  wispT = 1.5f;                                    // 一開機就冒第一顆煙
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
  } else {
    runIdle(dt);
  }
  stripFinish(dt);
  if (iconT > 0) { iconT -= dt; drawSoundIcon(clamp01(iconT / 0.4f)); }
  if (loopIconT > 0) { loopIconT -= dt; drawLoopIcon(clamp01(loopIconT / 0.4f)); }

  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) turnDot(x, y, rgb(toByte(fb[y][x].r), toByte(fb[y][x].g), toByte(fb[y][x].b)));
  for (int i = 0; i < STRIP; i++) strip.dot(i, rgb(toByte(sb[i].r), toByte(sb[i].g), toByte(sb[i].b)));
  show();                                          // 燈板和燈條一起送出
}
