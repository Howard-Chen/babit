// 生命遊戲
// @desc 康威的生命遊戲：生命一個一個冒出來、開始演化、停住後一個一個消失，再重新冒出來，一直循環；旋鈕調速度、按鈕 1 重來、按鈕 2 種一顆會長很久的種子
// 規則（每一代同時套到每一格）：
//   活的格子：旁邊剛好 2 或 3 個活的就活下去；太少（孤單）或太多（擁擠）就死掉。
//   空的格子：旁邊剛好 3 個活的，就長出一個新的。
// 畫面的上下、左右是接起來的：從右邊出去，會從左邊回來。
// 一輪：① 一個一個冒出來（先慢後快，約 2.5 秒）→ ② 開始演化 → ③ 停住不動或原地重複時，剩下的一個一個消失 → 回到 ①。
//   冒出來的點不平均：每輪隨機 2–3 個「熱點」，熱點附近很密、其他地方很少，比較看得出規則怎麼運作。
//   快結束時剩下的小圖形會一直閃：這時整面慢慢調暗、白光變弱，不會一直刺眼地閃。
// 顏色（同一個水藍色系，看活了多久）：剛長出來是純白（約一代）→ 偏綠的青綠 → 水藍 → 天藍 → 活很久的變深藍、暗一點；
//   整面還有一點像水波的藍綠色差在流動。死掉的留下殘影：往深藍、靛藍褪色、慢慢淡掉。
// 旋鈕：速度（最左每秒 1 代多、中間 5 代、最右 50 代）。按鈕 1：重來。
// 按鈕 2：在隨機的地方種一顆「長壽小圖形」（R 五格、π 七格、B 七格、橡實）：只有 5–7 格，卻會一直長、長很久。
// 燈板接電腦時亮度上限很低（保護電腦的 USB），白色和顏色會不明顯；接充電器（PD）才會到正常亮度。
#define PANEL 8
#include "BatoPixel.h"

struct C3 { float r, g, b; };              // 一個顏色（算的時候用小數）

// ───── 可以調的地方 ─────
const float BRIGHT = 0.55f;                // 整面亮度 0–1
const float HOT_DENSITY = 0.45f;           // 冒出來的時候：熱點中心大約幾成的格子是活的
const float BASE_DENSITY = 0.025f;         // 冒出來的時候：離熱點很遠的地方大約幾成
const float GEN_PER_SEC = 5;               // 旋鈕在中間時，每秒幾代
const float MAX_SPEED = 10;                // 旋鈕轉到最右是中間的幾倍（10 倍＝每秒 50 代）
const int STUCK_GENS = 25;                 // 停住（或原地重複）幾代之後結束這一輪
const float SEED_SEC = 2.5f;               // 一開始一個一個冒出來要幾秒
const float FADE_SEC = 1.5f;               // 結束時一個一個消失要幾秒
const float TRAIL_GENS = 5;                // 殘影留幾代（最少 0.6 秒）
const float WHITE_GENS = 1;                // 剛長出來純白維持幾代
const float END_DIM = 0.35f;               // 快結束（一直閃）時整面調暗多少（0.35＝暗 35%）
const float END_FLASH = 0.25f;             // 快結束時白光剩幾成
const C3 WHITE_C = {255, 255, 255};        // 剛長出來：純白
const C3 TEAL = {0, 230, 190};             // 水波色差裡的藍綠
const C3 PAL[6] = {                        // 顏色：青綠 → 水藍 → 天藍 → 深藍 → 更深的藍 → 靛藍（殘影最後褪到這裡）
  {0, 220, 195}, {0, 185, 255}, {0, 125, 255}, {10, 60, 235}, {25, 35, 210}, {45, 20, 190}};
const int8_t SEEDS[4][7][2] = {            // 按鈕 2 的種子：每一格的 (x, y)
  {{1, 0}, {2, 0}, {0, 1}, {1, 1}, {1, 2}},                         // R 五格
  {{0, 0}, {1, 0}, {2, 0}, {0, 1}, {2, 1}, {0, 2}, {2, 2}},         // π 七格
  {{0, 0}, {2, 0}, {3, 0}, {0, 1}, {1, 1}, {2, 1}, {1, 2}},         // B 七格
  {{1, 0}, {3, 1}, {0, 2}, {1, 2}, {4, 2}, {5, 2}, {6, 2}}};        // 橡實
const uint8_t SEED_LEN[4] = {5, 7, 7, 7};  // 每顆種子有幾格

enum { PH_SEED, PH_LIFE, PH_FADE };        // 這一輪進行到哪：冒出來、演化、消失
int phase = PH_SEED;
float phT = 0;                             // 這個階段過了幾秒
uint8_t cell[HEIGHT][WIDTH];               // 這一代：1 活、0 死
uint8_t nextCell[HEIGHT][WIDTH];           // 算下一代用
uint8_t nb[HEIGHT][WIDTH];                 // 旁邊 8 格有幾個活的
float lvl[HEIGHT][WIDTH];                  // 活著的格子亮起來的程度
float age[HEIGHT][WIDTH];                  // 活了幾代
float deadT[HEIGHT][WIDTH];                // 死了幾秒（殘影用）
float lastP[HEIGHT][WIDTH];                // 死掉時是 PAL 的第幾個顏色（可以有小數）
int16_t qCell[WIDTH * HEIGHT];             // 排好時間、要一個一個冒出來（或消失）的格子
float qTime[WIDTH * HEIGHT];               // 第幾秒輪到它
uint8_t qBirth[WIDTH * HEIGHT];            // 1 冒出來、0 消失
int qN = 0, qI = 0;                        // 排了幾個、輪到第幾個
int curX[7], curY[7];                      // 按鈕 2 正在種的種子：每一格的位置（順序已打亂）
int curN = 0, curI = 0;                    // 這一顆有幾格、種到第幾格
float nextPlant = 0;                       // 第幾秒種下一格
uint32_t hist[16];                         // 最近 16 代的指紋：用來發現「一直在重複」
int histN = 0;
int stuck = 0;                             // 已經停住（或重複）幾代
float endK = 0;                            // 快結束的程度（0～1）：整面跟著調暗
float genT = 0;                            // 累積到 1 就前進一代
float clk = 0;                             // 動畫時間（秒）
float lastSec = 0;                         // 上一格的 seconds()

C3 mix(C3 a, C3 b, float k) { return {a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k}; }
C3 scale(C3 c, float k) { return {c.r * k, c.g * k, c.b * k}; }
int toByte(float v) { return v < 0 ? 0 : (v > 255 ? 255 : (int)(v + 0.5f)); }
C3 pal(float p) {                          // PAL 的第 p 個顏色（有小數就混合前後兩個）
  p = constrain(p, 0.0f, 5.0f);
  int i = (int)p;
  if (i >= 5) return PAL[5];
  return mix(PAL[i], PAL[i + 1], p - i);
}
float agePos(float a) {                    // 活了 a 代 → 該用 PAL 的第幾個顏色
  if (a < 3) return a / 3;                 // 0–3 代：青綠 → 水藍
  if (a < 10) return 1 + (a - 3) / 7;      // 3–10 代：水藍 → 天藍
  return 2 + fminf(1, (a - 10) / 20);      // 10–30 代：天藍 → 深藍
}

void birth(int c) {                        // 長出來：一長出來就是最亮的純白
  int y = c / WIDTH, x = c % WIDTH;
  cell[y][x] = 1;
  age[y][x] = 0;
  lvl[y][x] = 1;
  deadT[y][x] = 99;
}
void death(int c) {                        // 死掉：記下當時的顏色，留殘影
  int y = c / WIDTH, x = c % WIDTH;
  cell[y][x] = 0;
  deadT[y][x] = 0;
  lastP[y][x] = agePos(age[y][x]);
}
void shuffle(int16_t *a, int n) {
  for (int i = n - 1; i > 0; i--) {
    int j = random(i + 1);
    int16_t t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}
void resetStuck() {                        // 重新開始判斷「停住了沒」
  stuck = 0;
  for (int i = 0; i < 16; i++) hist[i] = 0;
}

void startSeed() {                         // ① 一個一個冒出來：隨機挑格子、打亂順序、排時間（先慢後快）
  phase = PH_SEED;
  phT = 0;
  qN = qI = 0;
  curN = curI = 0;
  int hot = 2 + random(2);                 // 2–3 個熱點：熱點附近很密、其他地方很少
  float hx[4], hy[4], hr[4];
  for (int h = 0; h < hot; h++) {
    hx[h] = random(WIDTH);
    hy[h] = random(HEIGHT);
    hr[h] = 1.4f + random(1000) / 1000.0f * 0.8f;   // 熱點的大小（格）
  }
  for (int c = 0; c < WIDTH * HEIGHT; c++) {
    float x = c % WIDTH, y = c / WIDTH, p = BASE_DENSITY;
    for (int h = 0; h < hot; h++) {        // 離熱點越近越密（畫面左右、上下是接起來的，距離也接著算）
      float dx = fabsf(x - hx[h]), dy = fabsf(y - hy[h]);
      dx = fminf(dx, WIDTH - dx);
      dy = fminf(dy, HEIGHT - dy);
      p += HOT_DENSITY * expf(-(dx * dx + dy * dy) / (2 * hr[h] * hr[h]));
    }
    if (random(1000) < fminf(p, 0.6f) * 1000) qCell[qN++] = c;
  }
  shuffle(qCell, qN);
  for (int k = 0; k < qN; k++) {
    qTime[k] = SEED_SEC * powf((k + 1.0f) / qN, 0.6f);
    qBirth[k] = 1;
  }
}

void startFade() {                         // ③ 剩下的一個一個消失
  phase = PH_FADE;
  phT = 0;
  qN = qI = 0;
  curN = curI = 0;
  for (int c = 0; c < WIDTH * HEIGHT; c++)
    if (cell[c / WIDTH][c % WIDTH]) qCell[qN++] = c;
  shuffle(qCell, qN);
  for (int k = 0; k < qN; k++) {
    qTime[k] = FADE_SEC * (k + 1.0f) / qN;
    qBirth[k] = 0;
  }
}

void plantSeed() {                         // 按鈕 2：挑一顆種子（隨機形狀、方向、翻面、位置），一格一格種
  if (curI < curN) return;
  int r = random(10), p = r < 4 ? 0 : (r < 6 ? 1 : (r < 8 ? 2 : 3));   // R 五格最常出現
  int rot = random(4), flip = random(2), ox = random(WIDTH), oy = random(HEIGHT);
  curN = SEED_LEN[p];
  for (int i = 0; i < curN; i++) {
    int x = SEEDS[p][i][0], y = SEEDS[p][i][1];
    if (flip) x = -x;
    for (int k = 0; k < rot; k++) {        // 轉 90°
      int t = x;
      x = -y;
      y = t;
    }
    curX[i] = (ox + x + WIDTH * 4) % WIDTH;
    curY[i] = (oy + y + HEIGHT * 4) % HEIGHT;
  }
  for (int i = curN - 1; i > 0; i--) {     // 打亂種的順序
    int j = random(i + 1), tx = curX[i], ty = curY[i];
    curX[i] = curX[j];
    curY[i] = curY[j];
    curX[j] = tx;
    curY[j] = ty;
  }
  curI = 0;
  nextPlant = phT;
}

void countNeighbors() {                    // 每一格旁邊 8 格有幾個活的（邊緣接到另一邊）
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) {
      int n = 0;
      for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++)
          if (dx || dy) n += cell[(y + dy + HEIGHT) % HEIGHT][(x + dx + WIDTH) % WIDTH];
      nb[y][x] = n;
    }
}

void stepLife() {                          // ② 前進一代
  countNeighbors();
  int pop = 0;
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) {
      int n = nb[y][x];
      nextCell[y][x] = cell[y][x] ? (n == 2 || n == 3) : (n == 3);
      pop += nextCell[y][x];
    }
  uint32_t h = 2166136261u;                // 這一代的指紋（同一個樣子算出來一定一樣）
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) {
      int c = y * WIDTH + x;
      if (nextCell[y][x] && !cell[y][x]) birth(c);
      else if (!nextCell[y][x] && cell[y][x]) death(c);
      h = (h ^ cell[y][x]) * 16777619u;
    }
  bool seen = false;
  for (int i = 0; i < 16; i++)
    if (hist[i] == h) seen = true;
  hist[histN] = h;
  histN = (histN + 1) % 16;
  stuck = (seen || pop == 0) ? stuck + 1 : 0;
  if (pop == 0 && stuck < STUCK_GENS - 3) stuck = STUCK_GENS - 3;   // 全死光了：很快就重來
  if (stuck > (pop < 8 ? 8 : STUCK_GENS)) startFade();   // 停住了：這一輪結束（只剩幾格的話早點結束）
}

void setup() {
  begin();
  brightness(BRIGHT);
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) deadT[y][x] = 99;
  startSeed();
}

void loop() {
  float now = seconds();
  float dt = constrain(now - lastSec, 0.0f, 0.1f);            // 跟上一格差幾秒（大約 1/60）
  lastSec = now;
  clk += dt;
  phT += dt;
  float kv = knob.value();                                     // 旋鈕：最左 1/4 倍、中間 1 倍、最右 MAX_SPEED 倍
  float speed = kv < 0.5f ? powf(4, kv * 2 - 1) : powf(MAX_SPEED, kv * 2 - 1);
  float rate = phase == PH_LIFE ? GEN_PER_SEC * speed : GEN_PER_SEC;   // 每秒幾代（冒出來、消失的時候用中間的速度算顏色）
  if (button1.clicked() && phase != PH_FADE) startFade();      // 按鈕 1：重來（先消失，再重新冒出來）
  if (button2.clicked() && phase == PH_LIFE) plantSeed();     // 按鈕 2：種一顆會長很久的種子

  for (; qI < qN && qTime[qI] <= phT; qI++) {                  // 時間到的格子：冒出來或消失
    int c = qCell[qI];
    bool alive = cell[c / WIDTH][c % WIDTH];
    if (qBirth[qI] && !alive) birth(c);
    else if (!qBirth[qI] && alive) death(c);
  }
  bool planting = curI < curN;
  if (planting && phT >= nextPlant) {                          // 按鈕 2 的種子：一格一格種
    if (!cell[curY[curI]][curX[curI]]) birth(curY[curI] * WIDTH + curX[curI]);
    curI++;
    nextPlant = phT + fminf(0.06f, 1.5f / (rate * curN));
  }
  if (phase == PH_SEED && qI >= qN && phT > SEED_SEC + 0.6f) {  // 都冒出來了：開始演化
    phase = PH_LIFE;
    genT = 0;
    resetStuck();
  } else if (phase == PH_FADE && qI >= qN && phT > FADE_SEC + 0.9f) {   // 都消失了：重新冒出來
    startSeed();
  } else if (phase == PH_LIFE && !planting) {                  // 正在種的那一下先不演化
    genT += dt * rate;
    for (int i = 0; i < 3 && genT >= 1 && phase == PH_LIFE; i++) {   // 時間到了就前進一代（板子慢一點時，一格最多補 3 代）
      genT -= 1;
      stepLife();
    }
    if (genT > 1) genT = 1;
  }

  float endTarget = (phase == PH_LIFE && stuck > 2) || phase == PH_FADE ? 1 : 0;   // 一直在重複＝快結束了
  endK += (endTarget - endK) * fminf(1, dt * 3);
  float flashK = 1 - (1 - END_FLASH) * endK;                   // 快結束時白光變弱
  float dimK = 1 - END_DIM * endK;                             // 快結束時整面調暗
  float trailSec = fmaxf(TRAIL_GENS / rate, 0.6f);             // 殘影留幾秒
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) {
      C3 out = {0, 0, 0};
      if (cell[y][x]) {
        float a = age[y][x];
        a += dt * rate;
        age[y][x] = a;
        lvl[y][x] += (1 - lvl[y][x]) * fminf(1, dt * fmaxf(12, rate * 3));
        float wave = sinf(0.6f * x + 0.35f * y + clk * 0.9f);  // 像水波的色差：藍一點或藍綠一點
        C3 c = pal(agePos(a) + 0.3f * wave * fminf(1, a / 4));
        c = mix(c, TEAL, 0.3f * fmaxf(0, -wave) * fminf(1, a / 4));
        float w = a < WHITE_GENS ? 1 : fmaxf(0, 1 - (a - WHITE_GENS) / 0.5f);   // 純白一代，再很快變水藍
        c = mix(c, WHITE_C, w * flashK);
        float dimOld = 1 - 0.35f * fminf(1, a / 30);           // 活很久的暗一點
        out = scale(c, lvl[y][x] * dimOld * dimK);
      } else if (deadT[y][x] < trailSec) {                     // 殘影：往深藍、靛藍褪色、慢慢淡掉
        deadT[y][x] += dt;
        float f = deadT[y][x] / trailSec;
        out = scale(pal(lastP[y][x] + 2.5f * f), 0.8f * powf(1 - fminf(1, f), 1.5f) * dimK);
      }
      dot(x, y, rgb(toByte(out.r), toByte(out.g), toByte(out.b)));
    }
  show();
}
