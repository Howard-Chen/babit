// 沙漏番茄鐘
// @desc 跟著傾斜流動的水做成番茄鐘；旋鈕調稠度、按鈕 1 開始計時、按鈕 2 換顏色
// 16×16 燈板版：跟 8×8 一樣的程式，只差 PANEL 和亮度（WIDTH、HEIGHT、BANDS 自動跟著變）。
// 亮度：16×16 的燈是 8×8 的四倍，整面很刺眼，所以用 BRIGHT 調暗（0–1，沒寫是 0.6）。想亮一點就調大。
// 旋鈕：水的稠度（最左像水，晃很久；最右像蜂蜜，慢慢流；中間是一般的水）
// 按鈕 1：開始計時——水先清空，很快注到九分滿，接著 DURATION 秒慢慢漏完；計時中再按一次就重來
// 按鈕 2：換顏色（深海 → 森林 → 暮光 → 薰衣草 → 晨曦）；顏色跟著進度慢慢變，看熟了一眼就知道進度到哪
// 漏完：閃三下，留一顆會呼吸的小水滴，按按鈕 1 再來一次。
// 傾斜燈板，水往低的那邊流（預覽沒有傾斜感測器，會模擬左右搖擺）；聲音越大波越大，拍手會濺起來。
//
// 想直接拿來當番茄鐘用，改下面兩行：
//   1. DURATION 改成 25 * 60（25 分鐘；現在是示範用的 20 秒）
//   2. 喜歡哪一組顏色，就把 START_PALETTE 改成那一組的編號（0 深海、1 森林、2 暮光、3 薰衣草、4 晨曦），開機就是那個顏色
//
// 做法：tilt 給出畫面上的重力方向，水面用「彈簧＋阻尼」轉過去，所以傾斜時會晃。
// 每一格算出自己在重力方向上有多「低」，找出讓水量剛好的水面高度，水面以下點亮；
// 水面那一格只淹到一部分就只亮一部分，水面才會平滑移動。
#define PANEL 16
#include "BatoPixel.h"

const float BRIGHT = 0.24;       // 整面亮度 0–1

const float DURATION = 20;       // 漏完要幾秒：示範 20 秒，當番茄鐘用改成 25 * 60
const int START_PALETTE = 0;     // 開機用哪一組顏色（編號見下面的 PALETTES）
const float IDLE_WATER = 0.62;   // 還沒開始計時：水佔畫面的比例
const float FULL = 0.9;          // 開始計時：注到九分滿
const float FILL_TIME = 0.5;     // 注滿要幾秒

// 漸層：每組是「剛開始」和「快結束」兩個顏色（色相 0–360、飽和度 0–255、亮度 0–255），計時中慢慢從前者變成後者
struct Gradient { float h1, s1, v1, h2, s2, v2; };
const Gradient PALETTES[] = {
  {185, 128, 255, 232, 255, 209},   // 0 深海：越專注越深
  { 95, 140, 255, 158, 255, 191},   // 1 森林：嫩芽長成深林
  { 48, 166, 255,  12, 255, 230},   // 2 暮光：快結束偏暖
  {238, 102, 255, 285, 242, 217},   // 3 薰衣草：越來越沉靜
  {330,  89, 255, 380, 230, 255},   // 4 晨曦：粉色慢慢轉橘
};
const int PALETTE_COUNT = sizeof(PALETTES) / sizeof(PALETTES[0]);

const int S_IDLE = 0, S_FILL = 1, S_DRAIN = 2, S_DONE = 3;   // 狀態：還沒開始、注水、計時（漏水）、漏完
int state = S_IDLE;
float stateT = 0;                // 進入現在這個狀態的時間（秒）
int palette = START_PALETTE;     // 現在用哪一組顏色

// 畫水：down 是「往下」的方向角（0＝畫面右、π/2＝畫面下）；ph 波紋相位、amp 波高、foam 水面泛白 0..1；
// vol 水佔畫面的比例 0..1；hue、sat、val 是現在的顏色
void drawWater(float down, float ph, float amp, float foam, float vol, float hue, float sat, float val) {
  const int N = WIDTH * HEIGHT;
  const float sc = WIDTH / 8.0f;                          // 16×16 時每 2 格當 1 格算，波紋大小跟 8×8 一樣
  static float s[WIDTH * HEIGHT];
  float dx = cosf(down), dy = sinf(down);
  for (int i = 0; i < N; i++) {
    float px = ((i % WIDTH) - (WIDTH - 1) / 2.0f) / sc, py = ((i / WIDTH) - (HEIGHT - 1) / 2.0f) / sc;
    float u = -px * dy + py * dx;                         // 沿著水面的位置
    s[i] = (px * dx + py * dy + amp * sinf(1.7f * u - 2 * ph)) * sc;   // 這格有多「低」＋水面的波（換回格數）
  }
  // 找水面高度 L，讓水的面積剛好是 vol（二分法）
  float lo = -WIDTH, hi = WIDTH, L = 0;
  for (int k = 0; k < 20; k++) {
    L = (lo + hi) / 2;
    float area = 0;
    for (int i = 0; i < N; i++) area += constrain(s[i] - L + 0.5f, 0.0f, 1.0f);
    if (area > vol * N) lo = L; else hi = L;
  }
  for (int i = 0; i < N; i++) {
    int x = i % WIDTH, y = i / WIDTH;
    float under = s[i] - L + 0.5f;                        // 這格淹到多少：1 以上全淹，0–1 是水面那格
    if (under <= 0) continue;
    float fill = min(under, 1.0f);
    float depth = (under - 0.5f) / sc;
    // 光斑：兩道斜向的波相乘，形成會飄動的亮塊（0–1）
    float gx = x / sc, gy = y / sc;
    float glow = 0.5f + 0.5f * sinf(0.62f * gx + 0.40f * gy + ph) * sinf(0.38f * gx - 0.70f * gy - 2 * ph);
    float v = 0.42f + 0.30f * glow + 0.28f * expf(-max(0.0f, depth) / 1.8f);    // 越深越暗、光斑處較亮
    float sa = sat + (255 - sat) * 0.7f * constrain((0.9f - v) / 0.48f, 0.0f, 1.0f);   // 越暗的地方顏色越濃（淡色才不會變成灰）
    sa *= 1 - 0.55f * max(0.0f, glow - 0.72f) / 0.28f;                         // 最亮的光斑偏白
    if (depth < 0.7f) { v += 0.10f + 0.35f * foam; sa *= 0.88f - 0.5f * foam; }  // 水面那排亮一點、偏白；拍手、注水時更白
    dot(x, y, hsv(hue, sa, val * constrain(v, 0.12f, 1.0f) * fill));
  }
}

void setup() {
  begin();
  brightness(BRIGHT);        // 整面亮度（沒寫是 0.6）
}

void loop() {
  static float lastT = 0, ang = 1.5708f, vel = 0;        // 水面「往下」的方向角、轉動速度
  static float lvl = 0, foam = 0, ph = 0;                // 聲音大小、水面泛白、波紋相位
  float t = seconds();
  float dt = t - lastT;
  if (dt < 0 || dt > 0.05f) dt = 0.016f;
  lastT = t;

  if (button1.clicked()) { state = S_FILL; stateT = t; }            // 按一下按鈕 1：清空、注水、開始計時
  if (button2.clicked()) palette = (palette + 1) % PALETTE_COUNT;   // 按一下按鈕 2：換下一組顏色

  // 旋鈕：稠度。最左像水（阻尼小，晃很久），最右像蜂蜜（慢慢轉過去，幾乎不晃）
  float k = knob.value();
  float damp = 4 * powf(3.5f, k * 2 - 1);                // 阻尼：最左 1.1、中間 4、最右 14
  float spring = 60 - 40 * max(0.0f, k * 2 - 1);         // 水面轉向重力的力道：中間以左 60，往右減到 20
  float calm = 1.3f - 0.6f * k;                          // 波高與濺起來的大小：越稠越小

  // 水量與計時進度（progress 0～1，決定顏色）
  float vol = IDLE_WATER, progress = 0;
  if (state == S_FILL) {
    float u = (t - stateT) / FILL_TIME;
    if (u < 1) {
      vol = FULL * (1 - (1 - u) * (1 - u) * (1 - u));    // 一開始注得快，快滿時慢下來
      foam = max(foam, 0.6f);                            // 注水時水面翻白
    } else { state = S_DRAIN; stateT = t; }
  }
  if (state == S_DRAIN) {
    progress = (t - stateT) / DURATION;
    if (progress < 1) vol = FULL * (1 - progress);       // 線性漏完
    else { state = S_DONE; stateT = t; }
  }
  if (state == S_DONE) progress = 1;

  const Gradient& g = PALETTES[palette];
  float hue = g.h1 + (g.h2 - g.h1) * progress;
  float sat = g.s1 + (g.s2 - g.s1) * progress;
  float val = g.v1 + (g.v2 - g.v1) * progress;

  // 重力方向：燈板平放時畫面上幾乎沒有重力，水面維持原方向
  float gx = tilt.x(), gy = tilt.y();
  if (sqrtf(gx * gx + gy * gy) > 0.25f) {
    float err = atan2f(gy, gx) - ang;
    err = atan2f(sinf(err), cosf(err));                   // 走最短的方向
    vel += (spring * err - damp * vel) * dt;
  } else {
    vel -= damp * vel * dt;
  }
  ang += vel * dt;

  // 聲音：越大聲，波越大、跑越快；有節拍就濺一下（水往一邊甩、水面泛白）
  float snd = audio.level();
  lvl += (snd - lvl) * (snd > lvl ? 0.5f : 0.06f);       // 衝上快、退下慢
  ph += dt * TWO_PI / 2.8f * (1 + 3 * lvl);
  if (audio.beat()) {
    vel += (random(2) ? 1 : -1) * (2.5f + 3 * lvl) * calm;
    foam = 1;
  }
  foam = max(0.0f, foam - 2.5f * dt);

  clear();
  if (state == S_DONE) {
    float e = t - stateT;                                 // 漏完幾秒了
    if (e < 1.8f) {                                       // 閃三下
      if ((int)(e / 0.3f) % 2 == 0)
        for (int y = 0; y < HEIGHT; y++)
          for (int x = 0; x < WIDTH; x++) dot(x, y, hsv(hue, sat, val * 0.35f));
    } else {                                              // 留一顆會呼吸的小水滴，跟著傾斜待在最低的地方
      float breath = 0.25f + 0.75f * (0.5f - 0.5f * cosf((e - 1.8f) * 2.6f));
      drawWater(ang, ph, 0, 0, 1.5f * sq(WIDTH / 8.0f) / (WIDTH * HEIGHT), hue, sat, val * breath);
    }
  } else if (vol > 0.0005f) {
    drawWater(ang, ph, (0.3f + 1.4f * lvl) * calm, foam, vol, hue, sat, val);
  }
  show();
}
