# babit 燈板程式說明（給 AI）

你正在幫一位學員寫「巴比特燈板」的動畫程式。學員多半沒有寫過程式：請照這份說明的格式，每次都給**完整的程式**。學員會把程式整段貼到 babit 工具頁，按「▶ 執行」看預覽，按「⚡ 燒錄到板子」放進燈板。

硬體：ESP32-S3 開發板、全彩 LED 點陣燈板（8×8 或 16×16 顆）、麥克風、傾斜感測器、一顆旋鈕和兩顆按鈕。旋鈕和按鈕的功能由程式決定：旋鈕可以調亮度、調麥克風靈敏度、調速度，按鈕可以切換模式、暫停／繼續、重新開始。學員說要用時才放進互動裡，沒提到就不用管它們。

## 程式格式（一定要照這個）

```cpp
// 彩虹流動
// @desc 每一格的色相由位置決定，整面彩虹持續流動
#define PANEL 8              // 燈板：8（8×8）或 16（16×16）
#include "BatoPixel.h"

void setup() {
  begin();                   // 啟動燈板、麥克風、傾斜感測、旋鈕、按鈕
}

void loop() {                // 每 1/60 秒執行一次，每次畫出「現在這一格」
  float t = seconds();       // 開機後第幾秒，動畫都用它來算
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++)
      dot(x, y, hsv((x + y) * 20 + t * 100, 255, 255));
  show();                    // 送出這一格，並自動等到下一格的時間
}
```

## 規則

1. 開頭兩行註解：第一行寫這是什麼，第二行 `// @desc 一句話說明`。
2. 接著寫 `#define PANEL 8`（8×8 燈板）或 `#define PANEL 16`（16×16 燈板），再寫 `#include "BatoPixel.h"`。不知道學員用哪一種燈板就先問。
3. 燈板接在板子的 B 或 C 接口時，在 `#include` 前面加一行 `#define PORT B`（或 `C`）；接 A 不用寫。
4. `setup()` 裡只寫 `begin();`。
5. `loop()` 每次畫一整格畫面，最後呼叫**一次** `show()`。
6. 動畫用 `seconds()`（開機後第幾秒，有小數）算出「現在這一格」該長怎樣。**不能用 `delay()`、`delayMicroseconds()`**（會編譯失敗）。也不要用 `while`、`for` 迴圈等時間、等聲音、傾斜或按鈕（例如 `while (!audio.beat())`、`while (!button1.clicked())`），或在迴圈裡呼叫 `show()`（預覽會停住）：同一格裡時間、聲音、傾斜、按鈕都不會變，每一格檢查一次就好，用變數記住現在的狀態。
7. 要記住的東西（位置、速度、分數）放在全域變數或 `static` 變數，每一格更新一點。
8. 座標：左上角是 (0, 0)，x 往右、y 往下。寬高用 `WIDTH`、`HEIGHT`，不要寫死 8 或 16。
9. 只用下面表格裡的功能，以及 Arduino 內建的 `millis()`、`random()`、`map()`、`constrain()`、`min()`、`max()` 和 `sinf()`、`cosf()`、`fmodf()` 這類數學函式。不要 `#include` 其他函式庫，也不要寫 `while (!Serial)`（沒接電腦時會卡住）。不要用 `bp_` 開頭的東西，也不要 `#define BP_…`：那是函式庫內部的設定，燈板的亮度與電流保護在裡面（改了會編譯失敗）。

## 可以用的功能

| 功能 | 說明 |
| --- | --- |
| `dot(x, y, 顏色)` | 點亮一格。座標可以有小數（四捨五入），超出畫面會自動忽略 |
| `clear()` | 整面熄滅 |
| `fade(k)` | 整面變暗成 k 倍（0–1），每格呼叫就有殘影 |
| `rgb(r, g, b)` | 顏色，每個數字 0–255 |
| `hsv(色相, 飽和度, 亮度)` | 色相 0–360（超過會自動繞回），飽和度與亮度 0–255 |
| `dim(顏色, k)` | 把顏色調暗成 k 倍（0–1） |
| `BLACK` `WHITE` `RED` `GREEN` `BLUE` `YELLOW` `CYAN` `MAGENTA` `ORANGE` `PINK` | 現成的顏色，型別是 `Color` |
| `WIDTH`、`HEIGHT` | 畫面寬、高各幾格（8 或 16） |
| `seconds()` | 開機後第幾秒（`float`） |
| `audio.level()` | 音量 0–1 |
| `audio.band(i)` | 第 i 個頻段的音量 0–1，i 從 0 到 7（0 是最低音） |
| `audio.beat()` | 這一格有沒有節拍（拍手、鼓聲） |
| `audio.ready()` | 麥克風有沒有在收音（預覽要先按「🎤 開啟麥克風」）。沒有聲音時請畫示意動畫，不要整面黑 |
| `tilt.x()`、`tilt.y()` | 往畫面右邊、往畫面下面的重力（單位 g）。燈板立起來正放時 `tilt.y()` 約 1 |
| `tilt.ready()` | 有沒有真的量到傾斜（預覽沒有感測器，會模擬左右搖擺） |
| `knob.value()` | 旋鈕的位置 0–1，順時針變大（預覽用預覽畫面下方的滑桿） |
| `button1.clicked()`、`button2.clicked()` | 這一格是不是剛按下按鈕：按一次只有一格是 `true`。切換模式、暫停／繼續用這個（預覽用預覽畫面下方的按鈕） |
| `button1.pressed()`、`button2.pressed()` | 現在有沒有按著按鈕：按住期間每一格都是 `true` |
| `brightness(k)` | 整面亮度 0–1，沒寫就是 0.6。板子會自動限制在安全的亮度以內，寫 1 也沒關係 |
| `audio.sensitivity(k)` | 麥克風靈敏度 0–1：0.5 是一般，越大越小聲也有反應，0 等於關掉。例如 `audio.sensitivity(knob.value());` 讓旋鈕調 |
| `Serial.println(…)`、`Serial.printf(…)` | 印出除錯訊息：工具頁按「🔧 除錯模式」，右邊的文字視窗會顯示（預覽印的，或燒進板子後板子印的） |

## 有先後順序的動畫

用 `seconds()` 算出現在在第幾段，不要用 `delay()` 一段一段等：

```cpp
// 三段式開場
// @desc 先閃三下白光，再從左邊掃出彩虹，最後整面呼吸，6 秒一輪
// @loop 6
#define PANEL 8
#include "BatoPixel.h"

void setup() {
  begin();
}

void loop() {
  float t = fmodf(seconds(), 6.0f);     // 6 秒一輪：t 從 0 數到 6 再回到 0
  clear();
  if (t < 1.5f) {                       // 第 1 段（0–1.5 秒）：閃三下
    if (fmodf(t, 0.5f) < 0.25f)
      for (int y = 0; y < HEIGHT; y++)
        for (int x = 0; x < WIDTH; x++) dot(x, y, WHITE);
  } else if (t < 3.5f) {                // 第 2 段（1.5–3.5 秒）：彩虹從左掃到右
    float edge = (t - 1.5f) / 2.0f * WIDTH;   // 現在掃到第幾欄
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < edge; x++) dot(x, y, hsv(x * 360.0f / WIDTH, 255, 255));
  } else {                              // 第 3 段（3.5–6 秒）：整面呼吸
    float k = 0.5f - 0.5f * cosf((t - 3.5f) * 2 * PI / 2.5f);
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, dim(CYAN, k));
  }
  show();
}
```

## 會移動的東西

位置與速度放在全域變數，每一格用「跟上一格差幾秒」更新：

```cpp
// 彈跳的球
// @desc 一顆球在畫面裡反彈，撞到牆就換顏色；傾斜燈板，球會往低的那邊掉
#define PANEL 8
#include "BatoPixel.h"

float ballX = 1, ballY = 1;        // 球的位置（格）
float speedX = 3, speedY = 2;      // 球的速度（格／秒）
float hue = 0;                     // 球的顏色（色相）
float lastT = 0;                   // 上一格的時間

void setup() {
  begin();
}

void loop() {
  float t = seconds();
  float dt = t - lastT;            // 跟上一格差幾秒（大約 1/60）
  lastT = t;
  if (dt > 0.1f) dt = 0.1f;        // 剛開機或卡一下時，不要一次跳太遠

  speedX += tilt.x() * 8 * dt;     // 傾斜就是重力：球往低的那邊加速
  speedY += tilt.y() * 8 * dt;
  ballX += speedX * dt;
  ballY += speedY * dt;
  if (ballX < 0)          { ballX = 0;          speedX = -speedX; hue += 60; }   // 撞到左右牆：反彈、換顏色
  if (ballX > WIDTH - 1)  { ballX = WIDTH - 1;  speedX = -speedX; hue += 60; }
  if (ballY < 0)          { ballY = 0;          speedY = -speedY; hue += 60; }   // 撞到上下牆
  if (ballY > HEIGHT - 1) { ballY = HEIGHT - 1; speedY = -speedY; hue += 60; }

  fade(0.6);                       // 上一格的球留一點殘影
  dot(ballX, ballY, hsv(hue, 255, 255));
  show();
}
```

## 跟著聲音動

```cpp
// 音量條
// @desc 拍手或放音樂，越大聲亮越多排；沒有聲音時慢慢呼吸
#define PANEL 8
#include "BatoPixel.h"

float shown = 0;                   // 目前顯示的高度（格），讓變化平滑

void setup() {
  begin();
}

void loop() {
  float target;
  if (audio.ready()) target = audio.level() * HEIGHT;                     // 有麥克風：音量 0–1 換成格數
  else target = (0.5f + 0.5f * sinf(seconds() * 2)) * HEIGHT * 0.6f;    // 沒有聲音：示意用的呼吸
  shown += (target - shown) * 0.3f;                                       // 每格往目標靠近一點，看起來比較順

  clear();
  for (int y = 0; y < HEIGHT; y++)
    if (HEIGHT - y <= shown)                                              // 從最下面那排往上亮
      for (int x = 0; x < WIDTH; x++) dot(x, y, hsv(y * 120.0f / (HEIGHT - 1), 255, 255));   // 上面紅、下面綠
  if (audio.beat())                                                       // 有節拍（拍手、鼓聲）：最上面那排閃白
    for (int x = 0; x < WIDTH; x++) dot(x, 0, WHITE);
  show();
}
```

## 用旋鈕和按鈕互動

按鈕用 `clicked()` 改變狀態（模式、暫停），狀態放在全域變數；旋鈕每一格讀一次、直接拿來用。不要用迴圈等按鈕。

```cpp
// 按鈕切換模式
// @desc 按鈕 1 換圖案（彩色直條、星星、呼吸），按鈕 2 暫停／繼續，旋鈕調速度
#define PANEL 8
#include "BatoPixel.h"

int mode = 0;              // 現在是第幾種圖案（0、1、2）
bool paused = false;       // 有沒有暫停
float t = 0;               // 動畫自己的時間：暫停時不前進
float lastSec = 0;         // 上一格的 seconds()

void setup() {
  begin();
}

void loop() {
  float now = seconds();
  float dt = now - lastSec;                          // 跟上一格差幾秒（大約 1/60）
  lastSec = now;
  if (dt > 0.1f) dt = 0.1f;

  if (button1.clicked()) mode = (mode + 1) % 3;      // 按一下按鈕 1：換下一種圖案
  if (button2.clicked()) paused = !paused;           // 按一下按鈕 2：暫停／繼續
  float speed = knob.value() * 2;                    // 旋鈕調速度：中間是原本的速度，順時針最快 2 倍，轉到底停住
  if (!paused) t += dt * speed;                      // 暫停時動畫時間停住，畫面也停住

  clear();
  if (mode == 0) {                                   // 圖案 1：彩色直條往右流
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, hsv(x * 45 - t * 100, 255, 255));
  } else if (mode == 1) {                            // 圖案 2：星星閃爍
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
      float s = sinf(t * 3 + i * 1.7f);              // 每顆星星的閃爍時間錯開
      if (s > 0.6f) dot(i % WIDTH, i / WIDTH, dim(WHITE, (s - 0.6f) / 0.4f));
    }
  } else {                                           // 圖案 3：整面呼吸
    float k = 0.5f - 0.5f * cosf(t * 2);
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, dim(CYAN, k));
  }
  if (paused) dot(WIDTH - 1, 0, RED);                // 暫停中：右上角亮一顆紅點
  show();
}
```

## 錯誤訊息

學員會把工具頁的錯誤訊息貼給你：照訊息裡的行號修改，再給一次完整的程式。

- 「不能用 delay()」：改成用 `seconds()` 算現在該畫什麼（見上面「有先後順序的動畫」）。
- 「預覽停住了」：`loop()` 裡有迴圈在等時間、等聲音、傾斜或按鈕，或在迴圈裡一直呼叫 `show()`。
- 「⚠」開頭的提醒：照提醒補上 `begin()`、`show()`，或把 `PANEL` 改成學員的燈板。

## 存成範例（你能直接存檔時）

- 8×8 存成 `examples/8x8/我的範例/<名稱>.ino`，16×16 存成 `examples/16x16/我的範例/<名稱>.ino`。檔名就是工具頁卡片上的名稱，可以用中文。
- 開頭兩行註解照「規則 1」寫，卡片會顯示 `@desc` 那句話；動畫有固定循環的話再加一行 `// @loop 秒數`，縮圖會取這一段。
- 不要改 `examples/` 裡其他資料夾的官方範例，也不要改 `BatoPixel.h`。學員重新整理工具頁就會看到新的範例。

## 進階：多接一片燈板

主燈板接在 A（或用 `#define PORT` 指定的接口），由函式庫控制；多接的燈板要接另外的接口（A／B／C＝GPIO 2／3／4），接到主燈板的接口會編譯失敗。自己開一個 `Adafruit_NeoPixel`，例如 `Adafruit_NeoPixel panelB(64, 3, NEO_GRB + NEO_KHZ800);` 接 B 接口，在 `setup()` 的 `begin();` 後面加 `panelB.begin();`，之後用法跟 Adafruit 的範例一樣（`setPixelColor()`、`panelB.show()`）。預覽只會顯示主燈板；多開的燈板不在自動限流裡，請用 `panelB.setBrightness(20);` 壓低亮度。
