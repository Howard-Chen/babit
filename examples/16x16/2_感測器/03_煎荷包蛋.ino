// 煎荷包蛋
// @desc 燈板平放就是平底鍋：打一顆蛋進去，蛋黃從黃慢慢變橘紅、蛋白越煎越白；傾斜鍋子蛋會往低處流，流過的地方留下慢慢揮發的痕跡；用力甩一下會翻面，翻到第四次蛋黃會破
// 玩法：把燈板平放在桌上，當成從上面看下去的平底鍋。
//   打蛋：開機（和每次盛起來之後）往鍋子中間打一顆蛋，蛋白從蛋黃旁邊流開。
//   煎：蛋白從透明（暗暗的）慢慢變白（變亮）：薄的邊緣先熟，蛋黃旁邊厚的地方最慢；蛋黃從黃慢慢變橘紅。
//   傾斜：生的蛋會往低的地方流，搖晃時外圈稀的蛋白會散得很開，蛋黃旁邊濃的蛋白比較黏在一起。鍋子沒碰過蛋的地方全黑；蛋流過的地方留下一點液體的痕跡，大約 10 秒慢慢揮發掉。
//         底部煎到凝固以後就不會流了，要斜多一點，整顆蛋才會一起滑。
//   翻面：像甩平底鍋一樣，水平方向用力往前推、再快速拉回來（傾斜感測器量不到上下的動作）。
//         蛋會往甩的方向飛起來，在空中翻一圈再落下。翻過來看到的是煎過的那一面，蛋黃壓在底下，隔著蛋白是淡淡的黃。
//         同一顆蛋翻到第四次落下時，蛋黃會破掉、往四面八方流開；斜鍋子會跟著到處流，大約 12 秒後才凝固。
//   煎熟以後放著不動 8 秒，會自動盛起來，再打一顆新的蛋。
// 旋鈕：火力（最左小火、中間中火大約 70 秒煎熟、最右大火）。按鈕 1：盛起來，鍋子上的痕跡很快揮發乾淨，再打一顆新的蛋。按鈕 2：翻面。
// 預覽沒有傾斜感測器：會自己慢慢晃鍋子、每隔一陣子翻一次面，讓你看效果。
// 亮度：燈板接電腦和接充電器（PD）一樣亮（見下面的 BRIGHT）。
#define PANEL 16
#include "BatoPixel.h"

struct C3 { float r, g, b; };              // 一個顏色（算的時候用小數）
struct Drop {                              // 一顆小水滴：蛋白（和破掉的蛋黃）由很多小水滴組成，像液體一樣流
  float x, y;                              // 位置（格）：畫面左上角是 (0, 0)、右下角是 (16, 16)
  float vx, vy;                            // 速度（格／秒）
  float px, py;                            // 這一步開始前的位置
  float dx, dy;                            // 這一步被旁邊的小水滴推開（或拉近）多少
  float rho, rn;                           // 旁邊擠了多少（推開、拉回用）
  float th;                                // 這裡的蛋白有多厚：邊緣 0.35、中間 1
  float up, dn;                            // 朝上那面、貼著鍋子那面熟了多少：0 生、1 熟
  float rg;                                // 凝固了多少：0 會流、1 跟著整顆蛋一起動
  float thin;                              // 1＝外圈稀的蛋白（流得快、不太黏在一起）、0＝蛋黃旁邊濃的蛋白
};

// ───── 可以調的地方 ─────
// 整面亮度 0–1。燈板接電腦時，函式庫最暗只會到 12/255（再調低也是 12）；接充電器是 BRIGHT × 160。
// 0.075 × 160 = 12：接電腦、接充電器一樣亮。0.075 以下兩種一起變暗；調高的話只有接充電器會變亮。
// 網頁預覽會照 brightness() 的比例跟著變暗，0.075 會暗到看不清楚，所以預覽另外用 0.45。
#ifdef __EMSCRIPTEN__
const float BRIGHT = 0.45f;                // 網頁預覽的亮度
#else
const float BRIGHT = 0.075f;               // 燈板的亮度
#endif
const float COOK_SEC = 70;                 // 中火大約幾秒煎熟（蛋黃變橘紅、蛋白全白）
const float HEAT_RANGE = 3;                // 火力：旋鈕最右是中火的幾倍快、最左是幾分之一
const float FLOW_TILT = 0.05f;             // 生蛋：鍋子斜超過多少 g 才會流（0.05 g 大約 3 度）
const float SLIDE_TILT = 0.12f;            // 凝固的蛋：斜超過多少 g 才會整顆滑（大約 7 度）
const float FLOW_SPEED = 30;               // 生蛋流的速度（每斜 1 g，每秒流幾格）
const float SLIDE_SPEED = 22;              // 凝固的蛋整顆滑的速度（每斜 1 g，每秒幾格）
const float FLICK_G = 1.1f;                // 甩鍋子：瞬間的加速度超過幾 g 就翻面
const int BREAK_ON_FLIP = 4;               // 同一顆蛋第幾次翻面落下時蛋黃會破（0＝都不會破）
const float EVAP_SEC = 10;                 // 蛋流過的痕跡大約幾秒揮發完
const float WIPE_SEC = 1.2f;               // 按按鈕 1 換蛋時，鍋子上的痕跡幾秒內揮發乾淨（之後才打下一顆）
const float SERVE_IDLE = 8;                // 煎熟後放著不動幾秒，自動盛起來、打下一顆
const float THIN_PART = 0.6f;              // 蛋白有幾成是外圈稀的：搖晃、傾斜時會散得很開（0＝全部都是濃的）
const float THIN_RUN = 2.3f;               // 稀的蛋白流得比濃的快幾倍
const float THIN_COH = 0.06f;              // 稀的蛋白黏在一起的力剩幾成（越小散得越開）
const C3 RAW_WHITE = {60, 55, 46};         // 生的蛋白：透明，看起來暗暗的
const C3 DONE_WHITE = {255, 246, 228};     // 熟的蛋白：白
const C3 RAW_YOLK = {255, 185, 0};         // 生的蛋黃：黃
const C3 DONE_YOLK = {255, 72, 0};         // 熟的蛋黃：橘紅
const C3 SHINE_C = {255, 245, 190};        // 生蛋黃上的反光（熟了就不亮）
const C3 WET_WHITE = {30, 27, 22};         // 蛋白流過留下的痕跡
const C3 WET_YOLK = {44, 24, 0};           // 蛋黃流過留下的痕跡

// ───── 模擬用（通常不用改）─────
const int NW = 90;                         // 蛋白由幾顆小水滴組成（越多蛋越大、板子越忙）
const int NY = 30;                         // 蛋黃破掉後分成幾顆
const float H_W = 1.8f;                    // 小水滴互相影響的距離（格）
const float RHO0 = 2.0f;                   // 小水滴想要擠到的程度（越大擠越密、蛋越小）
const float K_PUSH = 0.06f;                // 擠太密時推開、太鬆時拉回的力道
const float K_NEAR = 0.06f;                // 靠太近時推開的力道（不會疊在一起）
const float COHESION = 1.0f;               // 太鬆時拉回來的比例（表面張力：越大蛋越圓）
const float H_Y = 2.0f, RHO0_Y = 0.7f, COH_Y = 0.02f;  // 破掉的蛋黃：很稀，攤得很開、形狀不規則
const float RUN_SEC = 12;                  // 破掉的蛋黃流幾秒才在鍋子上凝固
const float TAU_V = 0.10f;                 // 生蛋的黏稠：速度幾秒跟上傾斜（越大越滑溜）
const float TAU_R = 0.25f;                 // 凝固的蛋：速度幾秒跟上傾斜（越大越有重量感）
const float VMAX = 25;                     // 小水滴最快每秒幾格
const float WALL = 0.4f;                   // 鍋邊：小水滴中心離畫面邊緣最近幾格
const float CURVE = 2.5f, CURVE_G = 0.35f; // 鍋邊往上彎：最外圈幾格是斜的、最邊邊等於斜幾 g（放平時蛋會從鍋邊流回來）
const float NB_REF = 15;                   // 蛋白中間（最厚的地方）附近大約有多少蛋白
const float YOLK_R = 1.85f;                // 蛋黃半徑（格）
const float SPLAT_R = 1.35f;               // 畫的時候每顆小水滴畫多大（格）
const float EDGE_LO = 0.5f, EDGE_HI = 1.3f; // 畫的時候：擠到多少算蛋的邊緣、多少算完全蓋住
const float POUR_SEC = 0.5f;               // 打蛋：蛋白幾秒流完
const float AIR_SEC = 0.75f;               // 翻面：在空中幾秒
const float FLIP_DIST = 2.5f;              // 翻面：往甩的方向移幾格
const float FLIP_LIFT = 0.5f;              // 翻面：飛到最高時看起來放大幾成（離你比較近）
const float SPLASH = 12;                   // 生蛋落下時往外濺的速度（格／秒）
const float SERVE_SEC = 0.7f;              // 盛起來（變大、淡掉）要幾秒
const float EMPTY_SEC = 1.2f;              // 盛起來之後，空鍋子幾秒才打下一顆
const int MAXP = 1600;                     // 最多記幾對互相影響的小水滴
const float PI_F = 3.14159265f;

enum { EGG_NONE, EGG_PAN, EGG_AIR, EGG_SERVE };   // 鍋子裡：沒有蛋、蛋在鍋子上、翻面中、盛起來中
int state = EGG_NONE;
float stT = EMPTY_SEC - 0.4f;              // 這個狀態過了幾秒（開機 0.4 秒後打蛋）
Drop wd[NW];                               // 蛋白的小水滴
Drop yd[NY];                               // 破掉的蛋黃的小水滴
int nW = 0;                                // 已經倒進鍋子幾顆蛋白
float pourX = 8, pourY = 8;                // 打蛋的位置
bool hasYolk = false;                      // 蛋黃出現了沒
bool broken = false;                       // 蛋黃破了沒
float brokenT = 0;                         // 蛋黃破掉後幾秒
int flips = 0;                             // 這顆蛋翻了幾次
float yRun[NY], ySeepX[NY], ySeepY[NY];    // 破掉的蛋黃：每一滴流得多快、自己往哪邊滲（每滴不一樣，流開來才不規則）
bool yolkUp = true;                        // 蛋黃朝上（翻一次面就變朝下）
float yx = 8, yy = 8, yvx = 0, yvy = 0;    // 沒破的蛋黃：位置與速度
float yolkDone = 0;                        // 蛋黃熟了多少
float bounceT = 9;                         // 蛋黃落下後幾秒（彈一下用）
float rvx = 0, rvy = 0;                    // 凝固的部分整顆一起滑的速度
float eggAge = 0;                          // 打蛋後幾秒
float cooked = 0;                          // 朝上那面平均熟了多少
float rigidAvg = 0;                        // 平均凝固了多少
float idleT = 0;                           // 放著不動幾秒
float wipeT = 0;                           // 按鈕換蛋：痕跡快速揮發還剩幾秒
float lpx = 0, lpy = 0;                    // 傾斜的慢速平均：跟它差很多就是在甩
bool lpOn = false;
bool charging = false;                     // 偵測到甩鍋子：再看 0.07 秒，找最用力的方向
float chargeT = 0, bestX = 0, bestY = 0;
float coolT = 0;                           // 剛翻完面：冷卻中不會再翻
float nextDemo = 16;                       // 預覽：打蛋後第幾秒自動翻面
bool seeded = false;
float fdx = 1, fdy = 0;                    // 翻面的方向（往哪邊甩）
float fcx = 8, fcy = 8;                    // 起飛時蛋的中心
float fmx = 0, fmy = 0;                    // 落點離起飛點多遠
float tfCos = 1, tfS = 1, tfOx = 0, tfOy = 0, tfA = 1;   // 這一格畫蛋用的變形：翻轉、放大、移動、淡掉
bool tfFront = true;                       // 這一格看到的是不是原本朝上那面
float wetW[HEIGHT][WIDTH];                 // 蛋白痕跡還剩多少（0–1）
float wetY[HEIGHT][WIDTH];                 // 蛋黃痕跡還剩多少（0–1）
float evapK[HEIGHT][WIDTH];                // 每一格揮發的快慢不一樣，痕跡才會一塊一塊消失
float accW[2 * HEIGHT][2 * WIDTH];         // 畫圖用（每格切成 2×2 個點）：蛋白有多厚
float accD[2 * HEIGHT][2 * WIDTH];         // 畫圖用：蛋白的熟度加總
float accY[2 * HEIGHT][2 * WIDTH];         // 畫圖用：破掉的蛋黃有多厚
int16_t pairA[MAXP], pairB[MAXP];          // 互相影響的兩顆小水滴
float pairQ[MAXP], pairNX[MAXP], pairNY[MAXP];   // 靠多近（0–1）、從 A 指向 B 的方向
float lastSec = 0;
float clk = 0;

C3 mixC(C3 a, C3 b, float k) { return {a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k}; }
float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
float smooth(float a, float b, float v) { float t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
float rnd(float a, float b) { return a + (b - a) * random(10001) / 10000.0f; }
int toByte(float v) { return v < 0 ? 0 : (v > 255 ? 255 : (int)(v + 0.5f)); }

// 傾斜扣掉一點（靜摩擦）：斜不到 d0 就當平的
void deadzone(float gx, float gy, float d0, float &ox, float &oy) {
  float m = sqrtf(gx * gx + gy * gy);
  if (m <= d0) { ox = 0; oy = 0; return; }
  float k = (m - d0) / m;
  ox = gx * k; oy = gy * k;
}

// 小水滴之間：擠太密就推開、太鬆就拉回來（液體的壓力和表面張力）
void relax(Drop *p, int n, float hr, float rho0, float coh, float power, bool useRigid) {
  float h2 = hr * hr, inv = 1 / hr;
  int np = 0;
  for (int i = 0; i < n; i++) { p[i].rho = 0; p[i].rn = 0; p[i].dx = 0; p[i].dy = 0; }
  for (int i = 0; i < n; i++)
    for (int j = i + 1; j < n; j++) {
      float ex = p[j].x - p[i].x, ey = p[j].y - p[i].y, r2 = ex * ex + ey * ey;
      if (r2 >= h2 || np >= MAXP) continue;
      float r = sqrtf(r2), q = 1 - r * inv, q2 = q * q;
      if (r < 1e-3f) { ex = rnd(-1, 1); ey = rnd(-1, 1); r = sqrtf(ex * ex + ey * ey) + 1e-3f; }   // 疊在一起：隨便挑個方向推開
      p[i].rho += q2; p[j].rho += q2; p[i].rn += q2 * q; p[j].rn += q2 * q;
      pairA[np] = i; pairB[np] = j; pairQ[np] = q; pairNX[np] = ex / r; pairNY[np] = ey / r; np++;
    }
  for (int k = 0; k < np; k++) {
    Drop &a = p[pairA[k]], &b = p[pairB[k]];
    float q = pairQ[k], over = (a.rho + b.rho) * 0.5f - rho0;
    if (over < 0) over *= useRigid ? coh * (1 - (1 - THIN_COH) * 0.5f * (a.thin + b.thin)) : coh;   // 稀的蛋白不太黏在一起
    float push = (K_PUSH * over * q + K_NEAR * (a.rn + b.rn) * 0.5f * q * q) * power;
    float wa = useRigid ? 1 - 0.92f * a.rg : 1, wb = useRigid ? 1 - 0.92f * b.rg : 1;   // 凝固的比較推不動
    float s = push / (wa + wb);
    a.dx -= pairNX[k] * s * wa; a.dy -= pairNY[k] * s * wa;
    b.dx += pairNX[k] * s * wb; b.dy += pairNY[k] * s * wb;
  }
  for (int i = 0; i < n; i++) {
    float m = sqrtf(p[i].dx * p[i].dx + p[i].dy * p[i].dy), k = m > 0.25f ? 0.25f / m : 1;   // 一步最多推 0.25 格，不會炸開
    p[i].x += p[i].dx * k; p[i].y += p[i].dy * k;
  }
}

// 鍋邊往上彎：越靠近邊緣，往鍋子中間推的力越大（單位 g，跟傾斜加在一起）
void edgeG(float x, float y, float &gx, float &gy) {
  const float k = CURVE_G / CURVE;
  gx = 0; gy = 0;
  if (x < CURVE) gx += (CURVE - x) * k;
  if (x > WIDTH - CURVE) gx -= (x - (WIDTH - CURVE)) * k;
  if (y < CURVE) gy += (CURVE - y) * k;
  if (y > HEIGHT - CURVE) gy -= (y - (HEIGHT - CURVE)) * k;
}

// 每顆蛋白小水滴附近（2.6 格內）有多少蛋白：越多代表這裡越厚（邊緣薄、中間厚）
void measureThick() {
  for (int i = 0; i < nW; i++) wd[i].th = 0;
  for (int i = 0; i < nW; i++)
    for (int j = i + 1; j < nW; j++) {
      float ex = wd[j].x - wd[i].x, ey = wd[j].y - wd[i].y, d2 = ex * ex + ey * ey;
      if (d2 >= 6.76f) continue;
      float w = 1 - d2 * (1 / 6.76f);
      wd[i].th += w; wd[j].th += w;
    }
  for (int i = 0; i < nW; i++) {                     // 邊緣大約是中間的一半：換算成 0.35（邊緣）～ 1（中間）
    float raw = wd[i].th * (1 / NB_REF);
    wd[i].th = fminf(1.3f, fmaxf(0.3f, 0.35f + (raw - 0.55f) * 1.45f));
  }
}

// 小水滴撞到鍋邊：停在邊上；速度用這一步實際走了多少來算
void finishStep(Drop *p, int n, float h, bool &hitL, bool &hitR, bool &hitT, bool &hitB) {
  float inv = 1 / h;
  for (int i = 0; i < n; i++) {
    Drop &d = p[i];
    bool solid = d.rg > 0.5f;
    if (d.x < WALL) { d.x = WALL; if (solid) hitL = true; }
    if (d.x > WIDTH - WALL) { d.x = WIDTH - WALL; if (solid) hitR = true; }
    if (d.y < WALL) { d.y = WALL; if (solid) hitT = true; }
    if (d.y > HEIGHT - WALL) { d.y = HEIGHT - WALL; if (solid) hitB = true; }
    d.vx = (d.x - d.px) * inv; d.vy = (d.y - d.py) * inv;
    float m = d.vx * d.vx + d.vy * d.vy;
    if (m > VMAX * VMAX) { float k = VMAX / sqrtf(m); d.vx *= k; d.vy *= k; }
  }
}

// 蛋白前進一小步（h 秒）：fx, fy 是鍋子的傾斜（g）
void stepWhite(float h, float fx, float fy) {
  float kr = fminf(1, h / TAU_R), kv = fminf(1, h / TAU_V);
  float sgx = 0, sgy = 0, sw = 0, sx, sy;
  for (int i = 0; i < nW; i++) {                     // 凝固的部分整顆一起滑：鍋邊彎的力取平均
    if (wd[i].rg <= 0) continue;
    float ex, ey;
    edgeG(wd[i].x, wd[i].y, ex, ey);
    sgx += ex * wd[i].rg; sgy += ey * wd[i].rg; sw += wd[i].rg;
  }
  if (sw > 0) { sgx /= sw; sgy /= sw; }
  deadzone(fx + sgx, fy + sgy, SLIDE_TILT, sx, sy);  // 凝固的：斜多一點才整顆滑
  rvx += (sx * SLIDE_SPEED - rvx) * kr;
  rvy += (sy * SLIDE_SPEED - rvy) * kr;
  for (int i = 0; i < nW; i++) {
    Drop &d = wd[i];
    float ex, ey, ax, ay;
    edgeG(d.x, d.y, ex, ey);
    deadzone(fx + ex, fy + ey, FLOW_TILT, ax, ay);   // 生的：斜一點就流
    float mob = fmaxf(0.3f + 0.6f * d.thin, d.th * sqrtf(d.th)) * (1 + (THIN_RUN - 1) * d.thin);   // 厚的地方流得快、薄的邊緣跟得慢；稀的蛋白流得最快
    d.vx += (ax * FLOW_SPEED * mob - d.vx) * kv;
    d.vy += (ay * FLOW_SPEED * mob - d.vy) * kv;
    d.vx += (rvx - d.vx) * d.rg;                     // 凝固的部分跟著整顆蛋一起動
    d.vy += (rvy - d.vy) * d.rg;
    d.px = d.x; d.py = d.y;
    d.x += d.vx * h; d.y += d.vy * h;
  }
  relax(wd, nW, H_W, RHO0, COHESION, 1, true);
  bool hitL = false, hitR = false, hitT = false, hitB = false;
  finishStep(wd, nW, h, hitL, hitR, hitT, hitB);
  if ((hitL && rvx < 0) || (hitR && rvx > 0)) rvx = 0;   // 凝固的蛋撞到鍋邊就停
  if ((hitT && rvy < 0) || (hitB && rvy > 0)) rvy = 0;
}

// 沒破的蛋黃：浮在蛋白上，跟著底下的蛋白走；生的時候會往低處滑一點，但會被蛋白圍住
void stepYolk(float h, float ax, float ay) {
  float sw = 0, svx = 0, svy = 0, sr = 0, cw = 0, cx = 0, cy = 0;
  for (int i = 0; i < nW; i++) {
    float ex = wd[i].x - yx, ey = wd[i].y - yy, d2 = ex * ex + ey * ey;
    if (d2 >= 36) continue;
    float w = 1 - d2 * (1 / 36.0f);                  // 6 格以內的蛋白：蛋黃想待在它們中間
    cw += w; cx += w * wd[i].x; cy += w * wd[i].y;
    if (d2 >= 6.76f) continue;
    w = 1 - d2 * (1 / 6.76f);                        // 2.6 格以內的蛋白：載著蛋黃走
    sw += w; svx += w * wd[i].vx; svy += w * wd[i].vy; sr += w * wd[i].rg;
  }
  float tx = ax * FLOW_SPEED, ty = ay * FLOW_SPEED;  // 底下沒有蛋白：自己在鍋子上滑
  if (sw > 0.3f) {
    float loose = 1 - sr / sw;
    tx = svx / sw + (ax * 12 + (cx / cw - yx) * 2.5f) * loose;
    ty = svy / sw + (ay * 12 + (cy / cw - yy) * 2.5f) * loose;
  }
  float k = fminf(1, h / 0.08f);
  yvx += (tx - yvx) * k; yvy += (ty - yvy) * k;
  yx = fminf(WIDTH - 1.2f, fmaxf(1.2f, yx + yvx * h));
  yy = fminf(HEIGHT - 1.2f, fmaxf(1.2f, yy + yvy * h));
}

// 破掉的蛋黃：變成一灘很稀的液體，往四面八方慢慢滲開、被底下的蛋白載著走，斜鍋子就到處流；RUN_SEC 秒後才凝固
void stepYolkDrops(float h, float fx, float fy) {
  float flow = 1 - smooth(RUN_SEC * 0.4f, RUN_SEC, brokenT);   // 1 還是液體、0 凝固了
  float kv = fminf(1, h / TAU_V);
  for (int i = 0; i < NY; i++) {
    Drop &d = yd[i];
    float sw = 0, svx = 0, svy = 0;
    for (int j = 0; j < nW; j++) {
      float ex = wd[j].x - d.x, ey = wd[j].y - d.y, d2 = ex * ex + ey * ey;
      if (d2 >= 2.56f) continue;
      float w = 1 - d2 * (1 / 2.56f);
      sw += w; svx += w * wd[j].vx; svy += w * wd[j].vy;
    }
    float tx = rvx * (1 - flow), ty = rvy * (1 - flow);   // 流到鍋子上：凝固了就黏在蛋旁邊一起動
    if (sw > 0.05f) { tx = svx / sw; ty = svy / sw; }
    float ex, ey, ax, ay;
    edgeG(d.x, d.y, ex, ey);
    deadzone(fx + ex, fy + ey, FLOW_TILT, ax, ay);
    float k = flow * yRun[i];                        // 每一滴流得快慢不一樣，流出來才會一條一條、不規則
    tx += (ax * FLOW_SPEED + ySeepX[i]) * k; ty += (ay * FLOW_SPEED + ySeepY[i]) * k;
    d.vx += (tx - d.vx) * kv; d.vy += (ty - d.vy) * kv;
    d.px = d.x; d.py = d.y;
    d.x += d.vx * h; d.y += d.vy * h;
  }
  relax(yd, NY, H_Y, RHO0_Y, COH_Y, 0.1f + 0.9f * flow, false);
  bool a = false, b = false, c = false, e = false;
  finishStep(yd, NY, h, a, b, c, e);
}

// 煎：貼著鍋子那面熟得快；朝上那面看厚度（薄的邊緣快，蛋黃旁邊厚的地方最慢）
void cook(float dt, float heat) {
  float rate = dt * heat / (COOK_SEC * 0.45f), sumUp = 0, sumRg = 0;
  for (int i = 0; i < nW; i++) {
    Drop &d = wd[i];
    float th = d.th;
    if (hasYolk && !broken) {
      float ex = d.x - yx, ey = d.y - yy;
      th += 0.45f * clamp01(1 - (sqrtf(ex * ex + ey * ey) - 1.2f) / 2.4f);
    }
    d.dn = fminf(1, d.dn + rate / (0.55f + 0.45f * th));
    d.up = fminf(1, d.up + rate / (th * sqrtf(th)));
    d.rg = fmaxf(d.rg, smooth(0.35f, 0.8f, d.dn));  // 凝固了就不會再變回液體
    sumUp += d.up; sumRg += d.rg;
  }
  cooked = nW > 0 ? sumUp / nW : 0;
  rigidAvg = nW > 0 ? sumRg / nW : 0;
  if (hasYolk) yolkDone = fminf(1, yolkDone + dt * heat / COOK_SEC * (yolkUp ? 1 : 1.5f) * (broken ? 1.6f : 1));
}

// 打蛋：蛋白從打蛋的地方一顆一顆流出來，蛋黃稍後落在中間
void pour() {
  int want = (int)(eggAge / POUR_SEC * NW) + 1;
  if (want > NW) want = NW;
  while (nW < want) {
    Drop &d = wd[nW++];
    float a = rnd(0, 2 * PI_F), r = rnd(0, 0.5f), sp = rnd(2, 6);
    d.x = pourX + r * cosf(a); d.y = pourY + r * sinf(a);
    d.vx = sp * cosf(a); d.vy = sp * sinf(a);
    d.px = d.x; d.py = d.y;
    d.rho = 1.6f; d.rn = 0; d.th = 1; d.up = 0; d.dn = 0; d.rg = 0;
    d.thin = nW <= THIN_PART * NW ? 1 : 0;           // 先倒出來的會被後面的推到外圈：當成稀的蛋白
  }
  if (!hasYolk && eggAge > 0.12f) { hasYolk = true; yx = pourX; yy = pourY; yvx = 0; yvy = 0; bounceT = 0; }
}

void centroid(float &cx, float &cy) {
  cx = 0; cy = 0;
  for (int i = 0; i < nW; i++) { cx += wd[i].x; cy += wd[i].y; }
  if (nW > 0) { cx /= nW; cy /= nW; } else { cx = WIDTH * 0.5f; cy = HEIGHT * 0.5f; }
}

float fitIn(float v, float lo, float hi) { return lo > hi ? (lo + hi) * 0.5f : fminf(hi, fmaxf(lo, v)); }

void startPour() {
  state = EGG_PAN; stT = 0; nW = 0; eggAge = 0;
  hasYolk = false; broken = false; yolkUp = true; yolkDone = 0; flips = 0;
  rvx = 0; rvy = 0; idleT = 0; nextDemo = 16; cooked = 0; rigidAvg = 0; coolT = 0; charging = false;
  pourX = WIDTH * 0.5f + rnd(-0.8f, 0.8f); pourY = HEIGHT * 0.5f + rnd(-0.8f, 0.8f);
}

// 翻面：記下起飛的位置，算好落點（往甩的方向；翻過來之後整顆蛋要還在鍋子裡）
void startFlip(float dx, float dy) {
  float m = sqrtf(dx * dx + dy * dy);
  fdx = m > 1e-4f ? dx / m : 1; fdy = m > 1e-4f ? dy / m : 0;
  centroid(fcx, fcy);
  float mnx = 99, mxx = -99, mny = 99, mxy = -99;
  for (int i = 0; i < nW; i++) {
    float rx = wd[i].x - fcx, ry = wd[i].y - fcy, a = rx * fdx + ry * fdy;
    rx -= 2 * a * fdx; ry -= 2 * a * fdy;            // 翻過來：沿著甩的方向前後顛倒
    mnx = fminf(mnx, rx); mxx = fmaxf(mxx, rx); mny = fminf(mny, ry); mxy = fmaxf(mxy, ry);
  }
  float tx = fitIn(fcx + fdx * FLIP_DIST, WALL - mnx, WIDTH - WALL - mxx);
  float ty = fitIn(fcy + fdy * FLIP_DIST, WALL - mny, HEIGHT - WALL - mxy);
  fmx = tx - fcx; fmy = ty - fcy;
  state = EGG_AIR; stT = 0; charging = false; idleT = 0;
  if (!seeded) {                                     // 第一次翻面的時間點每次都不一樣：拿來當亂數種子，之後打蛋的位置、蛋黃破開的形狀才不會每次開機都一樣
    randomSeed(1 + (unsigned long)(seconds() * 1000) + (unsigned long)(fabsf(tilt.x()) * 100000));
    seeded = true;
  }
}

// 蛋黃破掉：主要往三個方向噴開（也有一些亂噴），之後每一滴繼續往外慢慢滲
void breakYolk() {
  broken = true; brokenT = 0;
  float jet[3];
  for (int k = 0; k < 3; k++) jet[k] = rnd(0, 2 * PI_F);
  for (int i = 0; i < NY; i++) {
    Drop &d = yd[i];
    float a = (i % 4 == 3) ? rnd(0, 2 * PI_F) : jet[i % 3] + rnd(-0.6f, 0.6f);
    float r = YOLK_R * sqrtf(rnd(0.02f, 0.8f)), sp = rnd(3, 11);
    d.x = yx + r * cosf(a); d.y = yy + r * sinf(a);
    d.vx = sp * cosf(a); d.vy = sp * sinf(a);
    d.px = d.x; d.py = d.y; d.rho = RHO0_Y; d.rn = 0; d.rg = 0; d.up = 0; d.dn = 0;
    yRun[i] = rnd(0.5f, 1.7f);
    float s = rnd(0.3f, 1.4f), b = a + rnd(-0.5f, 0.5f);       // 慢慢往外滲的速度（格／秒）
    ySeepX[i] = s * cosf(b); ySeepY[i] = s * sinf(b);
  }
}

// 落下：蛋真的翻過來（前後顛倒、上下兩面交換），生的部分往外濺；第四次落下時蛋黃破掉
void land() {
  float cx = fcx + fmx, cy = fcy + fmy;
  for (int i = 0; i < nW; i++) {
    Drop &d = wd[i];
    float a = (d.x - fcx) * fdx + (d.y - fcy) * fdy;
    d.x += fmx - 2 * a * fdx; d.y += fmy - 2 * a * fdy;
    float t = d.up; d.up = d.dn; d.dn = t;
    float ex = d.x - cx, ey = d.y - cy, m = sqrtf(ex * ex + ey * ey) + 0.3f;
    float sp = SPLASH * (1 - d.rg) * rnd(0.4f, 1.1f);
    d.vx = ex / m * sp; d.vy = ey / m * sp;
    d.px = d.x; d.py = d.y;
  }
  if (hasYolk && !broken) {
    float a = (yx - fcx) * fdx + (yy - fcy) * fdy;
    yx += fmx - 2 * a * fdx; yy += fmy - 2 * a * fdy; yvx = 0; yvy = 0;
  }
  if (broken)
    for (int i = 0; i < NY; i++) {
      Drop &d = yd[i];
      float a = (d.x - fcx) * fdx + (d.y - fcy) * fdy;
      d.x += fmx - 2 * a * fdx; d.y += fmy - 2 * a * fdy; d.vx = 0; d.vy = 0; d.px = d.x; d.py = d.y;
    }
  yolkUp = !yolkUp;
  rvx = 0; rvy = 0; bounceT = 0;
  state = EGG_PAN; stT = 0; coolT = 0.5f;
  flips++;
  if (hasYolk && !broken && flips == BREAK_ON_FLIP) breakYolk();   // 翻到第四次落下時蛋黃破掉
}

void startServe() { centroid(fcx, fcy); fdx = 1; fdy = 0; fmx = 0; fmy = 0; state = EGG_SERVE; stT = 0; charging = false; }

// 蛋上的一點畫在畫面哪裡：翻面時沿著甩的方向壓扁、翻過來，飛高時放大；盛起來時放大
void xform(float x, float y, float &ox, float &oy) {
  float rx = x - fcx, ry = y - fcy;
  float a = (rx * fdx + ry * fdy) * tfCos, b = ry * fdx - rx * fdy;
  ox = fcx + tfOx + tfS * (a * fdx - b * fdy);
  oy = fcy + tfOy + tfS * (a * fdy + b * fdx);
}

// 把一顆小水滴「印」到畫圖用的格子上（中間最厚、往外變薄）
void splat(float (*acc)[2 * WIDTH], float (*acc2)[2 * WIDTH], float x, float y, float rad, float v2) {
  float r2 = rad * rad, inv = 1 / r2;
  int i0 = (int)floorf((x - rad) * 2 - 0.5f), i1 = (int)ceilf((x + rad) * 2 - 0.5f);
  int j0 = (int)floorf((y - rad) * 2 - 0.5f), j1 = (int)ceilf((y + rad) * 2 - 0.5f);
  if (i0 < 0) i0 = 0;
  if (j0 < 0) j0 = 0;
  if (i1 > 2 * WIDTH - 1) i1 = 2 * WIDTH - 1;
  if (j1 > 2 * HEIGHT - 1) j1 = 2 * HEIGHT - 1;
  for (int j = j0; j <= j1; j++)
    for (int i = i0; i <= i1; i++) {
      float ex = (i + 0.5f) * 0.5f - x, ey = (j + 0.5f) * 0.5f - y, d2 = ex * ex + ey * ey;
      if (d2 >= r2) continue;
      float w = 1 - d2 * inv;
      w *= w;
      acc[j][i] += w;
      if (acc2) acc2[j][i] += w * v2;
    }
}

void render() {
  tfCos = 1; tfS = 1; tfOx = 0; tfOy = 0; tfA = 1; tfFront = true;
  if (state == EGG_AIR) {                            // 翻面：轉半圈、飛高再落下、往甩的方向移
    float u = clamp01(stT / AIR_SEC), e = u * u * (3 - 2 * u);
    tfCos = cosf(PI_F * e); tfS = 1 + FLIP_LIFT * sinf(PI_F * u);
    tfOx = fmx * e; tfOy = fmy * e; tfFront = tfCos >= 0;
  }
  if (state == EGG_SERVE) { float u = clamp01(stT / SERVE_SEC); tfS = 1 + 0.7f * u; tfA = (1 - u) * (1 - u); }

  for (int j = 0; j < 2 * HEIGHT; j++)
    for (int i = 0; i < 2 * WIDTH; i++) { accW[j][i] = 0; accD[j][i] = 0; accY[j][i] = 0; }
  bool egg = state != EGG_NONE;
  if (egg) {
    for (int k = 0; k < nW; k++) {
      float sx, sy;
      xform(wd[k].x, wd[k].y, sx, sy);
      splat(accW, accD, sx, sy, SPLAT_R * tfS, tfFront ? wd[k].up : wd[k].dn);
    }
    if (broken)
      for (int k = 0; k < NY; k++) {
        float sx, sy;
        xform(yd[k].x, yd[k].y, sx, sy);
        splat(accY, nullptr, sx, sy, 1.4f * tfS, 0);
      }
  }
  bool intact = egg && hasYolk && !broken;
  float ycx = 0, ycy = 0, ra = 1, rb = 1;
  if (intact) {                                      // 沒破的蛋黃：圓的（翻面時沿著甩的方向壓扁）、落下時彈一下
    xform(yx, yy, ycx, ycy);
    float bnc = 1 + 0.22f * expf(-9 * bounceT) * cosf(28 * bounceT);
    rb = YOLK_R * tfS * bnc;
    ra = fmaxf(0.35f, rb * fabsf(tfCos));
  }
  bool visUp = (yolkUp == tfFront);                  // 蛋黃在朝我們這面？不是的話隔著蛋白看
  C3 yc = mixC(RAW_YOLK, DONE_YOLK, yolkDone);
  float shine = intact && visUp ? 0.9f * (1 - smooth(0, 0.6f, yolkDone)) : 0;
  float shx = ycx - 0.3f * rb, shy = ycy - 0.35f * rb;   // 反光在蛋黃左上
  float wet = 1 - 0.2f * rigidAvg;                   // 凝固的蛋（整顆滑的時候）留下的痕跡淡一點點
  float wetYk = 0.3f + 0.7f * (1 - smooth(RUN_SEC * 0.4f, RUN_SEC, brokenT));   // 還是液體的蛋黃流過留下黃色痕跡

  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) {
      C3 tr = {WET_WHITE.r * wetW[y][x] + WET_YOLK.r * wetY[y][x], WET_WHITE.g * wetW[y][x] + WET_YOLK.g * wetY[y][x],
               WET_WHITE.b * wetW[y][x] + WET_YOLK.b * wetY[y][x]};
      float cr = 0, cg = 0, cb = 0, covW = 0, covY = 0;
      for (int s = 0; s < 4; s++) {                  // 每格取 2×2 個點平均，邊緣才會平滑
        int si = 2 * x + (s & 1), sj = 2 * y + (s >> 1);
        float px = (si + 0.5f) * 0.5f, py = (sj + 0.5f) * 0.5f;
        float w = accW[sj][si], cw = smooth(EDGE_LO, EDGE_HI, w) * tfA;
        float done = w > 1e-4f ? accD[sj][si] / w : 0;
        C3 wc = mixC(RAW_WHITE, DONE_WHITE, smooth(0.05f, 0.95f, done));
        C3 col = mixC(tr, wc, cw);
        float cy = 0;
        C3 yv = yc;
        if (intact && fabsf(px - ycx) < rb + 1 && fabsf(py - ycy) < rb + 1) {
          float ex = px - ycx, ey = py - ycy;
          float a = (ex * fdx + ey * fdy) / ra, b = (ey * fdx - ex * fdy) / rb;
          cy = clamp01((1 - sqrtf(a * a + b * b)) * fminf(ra, rb) / 0.55f + 0.5f);
          if (shine > 0) {
            float hx = px - shx, hy = py - shy;
            yv = mixC(yv, SHINE_C, clamp01(1 - sqrtf(hx * hx + hy * hy)) * shine);
          }
        } else if (broken) {
          cy = smooth(0.2f, 0.6f, accY[sj][si]);
          covY += cy;
        }
        cy *= tfA;
        if (!visUp) yv = mixC(yv, wc, cw * (broken ? 0.35f : 0.55f));   // 蛋黃在下面：隔著蛋白看，淡淡的
        col = mixC(col, yv, cy);
        cr += col.r; cg += col.g; cb += col.b; covW += cw;
      }
      if (state == EGG_PAN) {                        // 蛋在的地方是濕的（蛋離開後才看得到）
        wetW[y][x] = fmaxf(wetW[y][x], covW * 0.25f * wet);
        wetY[y][x] = fmaxf(wetY[y][x], covY * 0.25f * wetYk);
      }
      dot(x, y, rgb(toByte(cr * 0.25f), toByte(cg * 0.25f), toByte(cb * 0.25f)));
    }
}

void setup() {
  begin();
  brightness(BRIGHT);
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) { wetW[y][x] = 0; wetY[y][x] = 0; evapK[y][x] = rnd(0.6f, 1.5f); }
}

void loop() {
  float now = seconds();
  float dt = fminf(0.1f, fmaxf(0.0f, now - lastSec));   // 跟上一格差幾秒（大約 1/60）
  lastSec = now;
  clk += dt; stT += dt; bounceT += dt;
  float heat = powf(HEAT_RANGE, knob.value() * 2 - 1);  // 火力：最左 1/3、中間 1、最右 3 倍

  // 傾斜：有感測器就用量到的；沒有（預覽）就自己慢慢晃鍋子：斜 5 秒、放平 9 秒
  bool real = tilt.ready();
  float gx, gy;
  if (real) { gx = tilt.x(); gy = tilt.y(); }
  else {
    float a = 0.13f * fmaxf(0, sinf((clk - 4) * 2 * PI_F / 14) - 0.3f) / 0.7f, th = clk * 0.45f;
    gx = a * cosf(th); gy = a * sinf(th);
  }
  if (!real || !lpOn) { lpx = gx; lpy = gy; lpOn = real; }
  else { float k = fminf(1, dt / 0.25f); lpx += (gx - lpx) * k; lpy += (gy - lpy) * k; }
  float hx = gx - lpx, hy = gy - lpy, hm = sqrtf(hx * hx + hy * hy);   // 甩動：跟慢速平均差多少
  float fx = gx, fy = gy;                            // 流動用的傾斜：突然的晃動最多算 0.8 g，甩鍋子時蛋不會被扯散
  if (hm > 0.8f) { fx = lpx + hx * 0.8f / hm; fy = lpy + hy * 0.8f / hm; }
  float ax, ay;
  deadzone(fx, fy, FLOW_TILT, ax, ay);
  if (real && (hm > 0.25f || ax != 0 || ay != 0)) idleT = 0; else idleT += dt;   // 甩、斜都算在動

  // 翻面：甩鍋子（或按鈕 2、預覽每隔一陣子）
  if (coolT > 0) coolT -= dt;
  if (state == EGG_PAN && nW == NW && coolT <= 0) {
    if (!charging && real && hm > FLICK_G) { charging = true; chargeT = 0; bestX = hx; bestY = hy; }
    if (charging) {
      if (hx * hx + hy * hy > bestX * bestX + bestY * bestY) { bestX = hx; bestY = hy; }
      chargeT += dt;
      if (chargeT >= 0.07f) startFlip(-bestX, -bestY);   // 感測器量到的是反方向的慣性：蛋要往鍋子被甩的方向飛
    }
    if (state == EGG_PAN && (button2.clicked() || (!real && eggAge > nextDemo))) {
      float a = rnd(0, 2 * PI_F);
      startFlip(cosf(a), sinf(a));
      nextDemo = eggAge + 14;
    }
  }
  if (button1.clicked() && state != EGG_AIR) {       // 按鈕 1：盛起來、痕跡很快揮發乾淨，再打下一顆
    wipeT = WIPE_SEC;
    if (state == EGG_PAN) startServe();
    else if (state == EGG_NONE) stT = EMPTY_SEC - WIPE_SEC;   // 空鍋子：等痕跡乾了就打蛋
  }

  if (state == EGG_NONE && stT >= EMPTY_SEC) startPour();
  if (state == EGG_PAN) {
    eggAge += dt; brokenT += dt;
    if (nW < NW) pour();
    measureThick();
    float h = dt * 0.5f;                             // 每格分兩小步算，比較穩
    if (h > 0)
      for (int s = 0; s < 2; s++) {
        stepWhite(h, fx, fy);
        if (hasYolk && !broken) stepYolk(h, ax, ay);
        if (broken) stepYolkDrops(h, fx, fy);
      }
    cook(dt, heat);
    if (cooked > 0.85f && yolkDone > 0.95f && idleT > SERVE_IDLE) startServe();
  }
  if (state == EGG_AIR && stT >= AIR_SEC) land();
  if (state == EGG_SERVE && stT >= SERVE_SEC) { state = EGG_NONE; stT = 0; nW = 0; hasYolk = false; broken = false; }

  float evap = wipeT > 0 ? 1 / (WIPE_SEC * 0.6f) : 1 / EVAP_SEC;   // 換蛋時揮發得很快（evapK 最小 0.6，WIPE_SEC 內一定乾）
  if (wipeT > 0) wipeT -= dt;
  for (int y = 0; y < HEIGHT; y++)                   // 痕跡慢慢揮發（每格快慢不一樣，一塊一塊乾掉）
    for (int x = 0; x < WIDTH; x++) {
      float k = dt * evap * evapK[y][x];
      wetW[y][x] = fmaxf(0, wetW[y][x] - k);
      wetY[y][x] = fmaxf(0, wetY[y][x] - k);
    }
  render();
  show();
}
