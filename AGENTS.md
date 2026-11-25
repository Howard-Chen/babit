# babit 燈板程式說明（給 AI）

你正在幫一位學員寫「巴比特燈板」的動畫程式。學員多半沒有寫過程式：請照這份說明的格式，每次都給**完整的程式**。學員會把程式整段貼到 babit 工具頁，按「▶ 執行」看預覽，按「⚡ 燒錄到板子」放進燈板。

硬體：ESP32-S3 開發板、全彩 LED 點陣燈板（8×8 或 16×16 顆）、麥克風、傾斜感測器、一顆旋鈕、四顆按鈕和一顆蜂鳴器；有些課程會在另一個接口多接一條燈條（見「接一條燈條」）。旋鈕、按鈕、蜂鳴器的功能由程式決定：旋鈕可以調速度、調亮度、調麥克風靈敏度，按鈕可以換圖案、換顏色、重新開始，蜂鳴器可以配音效、播旋律。學員說要用時才放進互動裡，沒提到就不用管它們；學員沒指定用途時，照官方範例的慣例：旋鈕調快慢或強弱、按鈕 1 換內容（圖案、文字、模式）、按鈕 2 換顏色。學員沒要求時不要做暫停（畫面停住會被以為壞掉），旋鈕轉到最左畫面也要還在動；學員要求暫停（計時器、播放器）時照做，但暫停中畫面要留一點會動的東西。

面對燈板看：按鈕 1、2 在板子的上緣（1 在左、2 在右），按鈕 3、4 在下緣、正對著 1 和 2（3 在左、4 在右）。兩個人面對面玩的遊戲可以一人用 1、2，另一人用 3、4。按鈕 3、4 和蜂鳴器是 2026 年 11 月改版的板子才有的；舊版的板子下緣沒有按鈕，`button3`、`button4` 永遠是沒按、蜂鳴器不會響，其他功能一樣。要用到按鈕 3、4 或蜂鳴器、又不確定學員的板子有沒有時，先問學員：板子的下緣有沒有兩顆按鈕。

## 程式格式（一定要照這個）

```cpp
// 彩虹流動
// @desc 每一格的色相由位置決定，整面彩虹持續流動
#define PANEL 8              // 燈板：8（8×8）或 16（16×16）
#include "BatoPixel.h"

void setup() {
  begin();                   // 啟動燈板、麥克風、傾斜感測、旋鈕、按鈕、蜂鳴器
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
3. 燈板接在板子的 B 接口時，在 `#include` 前面加一行 `#define PORT B`；接 A 不用寫。
4. `setup()` 裡寫 `begin();`。要固定整面亮度就在後面加一行 `brightness(0.3);`（0–1，沒寫是 0.6；只亮少數幾格的動畫，例如跑馬燈，調暗一點比較不刺眼）。
5. `loop()` 每次畫一整格畫面，最後呼叫**一次** `show()`。
6. 動畫用 `seconds()`（開機後第幾秒，有小數）算出「現在這一格」該長怎樣。**不能用 `delay()`、`delayMicroseconds()`**（會編譯失敗）。也不要用 `while`、`for` 迴圈等時間、等聲音、傾斜、按鈕，或等蜂鳴器響完（例如 `while (!audio.beat())`、`while (!button1.clicked())`、`while (buzzer.playing())`），或在迴圈裡呼叫 `show()`（預覽會停住）：同一格裡時間、聲音、傾斜、按鈕、蜂鳴器都不會變，每一格檢查一次就好，用變數記住現在的狀態。很快就跑完的迴圈（畫每一格、找一個空的位置、檢查有沒有撞到）照常可以用。
7. 要記住的東西（位置、速度、分數）放在全域變數或 `static` 變數，每一格更新一點。要準確計時的東西（倒數計時器、碼錶）記下開始時的 `seconds()`，用現在的 `seconds()` 減掉它，不要把每一格的時間一點一點加起來。
8. 座標：左上角是 (0, 0)，x 往右、y 往下。寬高用 `WIDTH`、`HEIGHT`，不要寫死 8 或 16。
9. 只用下面表格裡的功能，以及 Arduino 內建的 `millis()`、`random()`、`map()`、`constrain()`、`min()`、`max()` 和 `sinf()`、`cosf()`、`fmodf()` 這類數學函式。`random()` 在板子上每次開機都不一樣，不用寫 `randomSeed()`（預覽每次執行的順序一樣）。沒有內建的文字、數字功能：要顯示數字就自己用陣列畫小數字，或用方塊、長條代表數量。不要 `#include` 其他函式庫（真的需要標準標頭檔時只寫名稱，例如 `#include <math.h>`，不能寫路徑），也不要用 `#embed`、`asm`、`__has_include`、巨集裡的 `##`（會被擋下：程式不能讀電腦上的檔案）。不要寫 `while (!Serial)`（沒接電腦時會卡住）。不要用 `bp_` 開頭的東西，也不要 `#define BP_…`：那是函式庫內部的設定，燈板的亮度與電流保護在裡面（改了會編譯失敗）。

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
| `audio.band(i)` | 第 i 個頻段的音量 0–1，i 從 0 到 `BANDS - 1`（0 是最低音）。`BANDS` 是頻段數：8×8 燈板 8 段、16×16 燈板 16 段，剛好一欄一段 |
| `audio.beat()` | 這一格有沒有節拍（拍手、鼓聲） |
| `audio.ready()` | 麥克風有沒有在收音（預覽要先按「🎤 開啟麥克風」）。沒有聲音時請畫示意動畫，不要整面黑 |
| `tilt.x()`、`tilt.y()` | 往畫面右邊、往畫面下面的重力（單位 g）。燈板立起來正放時 `tilt.y()` 約 1；平放在桌上時兩個都約 0 |
| `tilt.ready()` | 有沒有真的量到傾斜。預覽沒有感測器，會模擬左右搖擺：靠傾斜觸發的東西（警報、開關）在預覽會一直被觸發，可以用它判斷，沒有感測器就當成沒有傾斜 |
| `knob.value()` | 旋鈕的位置 0–1，順時針變大（預覽用預覽畫面下方的滑桿） |
| `button1.clicked()`～`button4.clicked()` | 這一格是不是剛按下按鈕：按一次只有一格是 `true`，同一格裡問幾次答案都一樣。換圖案、換顏色用這個（預覽用預覽畫面下方的按鈕）。四顆按鈕是 `button1`、`button2`、`button3`、`button4` |
| `button1.pressed()`～`button4.pressed()` | 現在有沒有按著按鈕：按住期間每一格都是 `true` |
| `buzzer.beep(頻率, 秒)` | 蜂鳴器響一聲：頻率（Hz）就是音高，響這麼多**秒**就自己停（不是毫秒：0.1＝100 毫秒），程式不會停下來等，例如 `buzzer.beep(NOTE_E7, 0.1);`。頻率給 0＝這段時間不出聲（旋律裡的休止符）。會取代正在響的聲音 |
| `buzzer.tone(頻率)` | 一直響，直到 `buzzer.off()`。每一格用同一個頻率呼叫沒關係（不會重新起音）；每一格換一個頻率就是滑音（警報聲） |
| `buzzer.off()` | 馬上停：`beep()` 還沒響完的音（或休止）也會停，`playing()` 變成 `false`。不要每一格都呼叫，會把別的地方叫的 `beep()` 和旋律一起停掉；「按著才響」只在放開的那一格呼叫（見下面的範例） |
| `buzzer.playing()` | 蜂鳴器是不是還在響（或還在休息）。旋律要一個音接一個音時，用它判斷上一個音響完了沒 |
| `buzzer.ready()` | 板子上有沒有蜂鳴器（舊版的板子沒有；預覽一律當成有）。想在沒有蜂鳴器的板子上改用畫面提示時用它判斷 |
| `NOTE_C4`、`NOTE_CS4`、`NOTE_D4`…`NOTE_C8` | 音名的頻率，名稱和數值跟 Arduino 的 pitches.h 一樣（`NOTE_C4` 是中央 C，`NOTE_CS4` 是升 C，數字是第幾個八度；從 `NOTE_C1` 到 `NOTE_DS8` 都有），已經內建：不要 `#include "pitches.h"`，也不用自己定義。頻率也可以直接寫數字（40–20000）。這顆蜂鳴器大約 2000–3200 Hz 最大聲（`NOTE_C7`～`NOTE_G7`），1000 Hz 以下很小聲：音效和旋律請寫在第 7 個八度附近，需要低一點再用第 6 個八度。音量不能調：要小聲一點就用低一點的音 |
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

按鈕用 `clicked()` 改變狀態（換圖案、換顏色），狀態放在全域變數；旋鈕每一格讀一次、直接拿來用。不要用迴圈等按鈕。學員沒指定用途時：旋鈕調快慢或強弱、按鈕 1 換內容、按鈕 2 換顏色。

- 學員沒要求時不要做暫停：畫面停住會被以為壞掉。旋鈕轉到最左也要還在動（例如速度最慢 0.25 倍，不要到 0）。
- 跟著旋鈕變快變慢的動畫，用自己的時間變數每一格加上「速度 × 經過的秒數」（如下的 `t`）；直接拿 `seconds()` 乘速度，轉旋鈕時畫面會跳。

```cpp
// 圖案切換
// @desc 旋鈕調速度、按鈕 1 換圖案（呼吸、星星、掃描線）、按鈕 2 換顏色
#define PANEL 8
#include "BatoPixel.h"

const Color COLORS[] = {CYAN, ORANGE, PINK, GREEN};   // 按鈕 2 輪流換的顏色
int mode = 0;              // 現在是第幾種圖案（0、1、2）
int colorIndex = 0;        // 現在用 COLORS 裡的第幾個顏色
float t = 0;               // 動畫自己的時間：每格加上「速度 × 經過的秒數」
float lastSec = 0;         // 上一格的 seconds()

void setup() {
  begin();
}

void loop() {
  float now = seconds();
  float dt = now - lastSec;                          // 跟上一格差幾秒（大約 1/60）
  lastSec = now;
  if (dt > 0.1f) dt = 0.1f;

  if (button1.clicked()) mode = (mode + 1) % 3;                // 按一下按鈕 1：換下一種圖案
  if (button2.clicked()) colorIndex = (colorIndex + 1) % 4;    // 按一下按鈕 2：換下一個顏色
  float speed = 0.25f + knob.value() * 1.75f;                  // 旋鈕調速度：最左 0.25 倍（還在動）、最右 2 倍
  t += dt * speed;
  Color c = COLORS[colorIndex];

  clear();
  if (mode == 0) {                                   // 圖案 1：整面呼吸
    float k = 0.5f - 0.5f * cosf(t * 2);
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++) dot(x, y, dim(c, k));
  } else if (mode == 1) {                            // 圖案 2：星星閃爍
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
      float s = sinf(t * 3 + i * 1.7f);              // 每顆星星的閃爍時間錯開
      if (s > 0.6f) dot(i % WIDTH, i / WIDTH, dim(c, (s - 0.6f) / 0.4f));
    }
  } else {                                           // 圖案 3：一條線由上往下掃
    int row = (int)(t * 4) % HEIGHT;
    for (int x = 0; x < WIDTH; x++) dot(x, row, c);
  }
  show();
}
```

## 用蜂鳴器發出聲音

蜂鳴器只用 `buzzer`，不用寫腳位。不要用 Arduino 的 `tone()`、`noTone()`，也不要替蜂鳴器寫 `pinMode()`、`digitalWrite()`（會編譯失敗，或在板子上出問題）；學員貼來的程式有 `tone(腳位, 頻率, 毫秒)` 就改成 `buzzer.beep(頻率, 秒)`，`tone(腳位, 頻率)` 改成 `buzzer.tone(頻率)`，`noTone(腳位)` 改成 `buzzer.off()`。變數不要取名叫 `buzzer`、`button1`～`button4`（這些名字函式庫已經用了）。

- 音效：`buzzer.beep(頻率, 秒)` 叫它響一聲就繼續往下跑，時間到了自己停。
- 旋律：把音放在陣列裡，用一個變數記住唱到第幾個，每一格用 `buzzer.playing()` 看上一個音響完了沒，響完才叫下一個。每個音後面留一小段休息（`buzzer.beep(0, 秒)`），音跟音才聽得出斷開；連續兩個一樣的音沒有休息會黏成一個長音。不要用迴圈等它響完，也不要用 `delay()`。
- 按著才響：按下的那一格 `buzzer.tone(頻率)`，放開的那一格 `buzzer.off()`，用一個變數記住現在是不是按著在響。不要寫成「沒按就每一格 `off()`」。

```cpp
// 音效與旋律
// @desc 按鈕 1 嗶一聲、畫面閃一下；按鈕 2 播一小段旋律，每個音換一個顏色；按住按鈕 3 的時候一直響
#define PANEL 8
#include "BatoPixel.h"

// 旋律：每個音的音高，和它佔幾拍。0＝休止符。連續兩個一樣的音也可以（每個音後面會留一小段休息）
const int   SONG[]  = {NOTE_C7, NOTE_C7, NOTE_G7, NOTE_G7, NOTE_A7, NOTE_A7, NOTE_G7, 0};
const float BEATS[] = {1, 1, 1, 1, 1, 1, 2, 1};
const int SONG_LEN = sizeof(SONG) / sizeof(SONG[0]);   // 有幾個音：跟著陣列算，換旋律不用改這一行
const float BEAT = 0.25f;  // 一拍幾秒
const float GAP = 0.03f;   // 音跟音之間休息幾秒
int step = -1;             // 現在唱到第幾個音；-1＝沒有在唱
bool resting = false;      // 剛響完一個音，接下來要先休息一小段
bool holding = false;      // 蜂鳴器是不是因為按著按鈕 3 而在響
float flash = 0;           // 畫面閃光的亮度（0–1），每一格暗一點
float hue = 200;           // 畫面的顏色（色相）

void setup() {
  begin();
}

void loop() {
  if (button1.clicked()) {                 // 按鈕 1：嗶一聲（0.08 秒），畫面閃一下
    buzzer.beep(NOTE_E7, 0.08f);
    flash = 1;
  }
  if (button2.clicked()) {                 // 按鈕 2：旋律從頭開始唱
    step = 0;
    resting = false;
  }

  // 旋律：上一個音（或休息）結束了才接下一個；每一格看一次就好，不用迴圈等
  if (step >= 0 && !buzzer.playing()) {
    if (resting) {                         // 剛響完一個音：先休息一小段
      buzzer.beep(0, GAP);
      resting = false;
    } else if (step < SONG_LEN) {          // 下一個音：長度是「拍數 × 一拍幾秒」扣掉休息
      buzzer.beep(SONG[step], BEATS[step] * BEAT - GAP);
      hue = step * 45;                     // 每個音換一個顏色
      flash = 1;
      step++;
      resting = true;
    } else {
      step = -1;                           // 唱完了
    }
  }

  // 按著才響：按下的那一格開始響，放開的那一格才停
  if (button3.pressed() && !holding) {
    buzzer.tone(NOTE_C7);
    holding = true;
    step = -1;                             // 旋律先停掉
  }
  if (!button3.pressed() && holding) {
    buzzer.off();
    holding = false;
  }

  flash *= 0.9f;                           // 閃光慢慢暗下來
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) dot(x, y, dim(hsv(hue, 255, 255), 0.1f + 0.9f * flash));
  show();
}
```

## 接一條燈條

學員說有接燈條時才用（例如聖誕花圈外面那一圈燈）；沒提到就不要加。在 `#include` 前面加一行 `#define STRIP 60`，數字是燈條有幾顆燈（1–300，不知道就問學員）。燈條接在板子上燈板沒用的那個接口，不用設定腳位：燈板在 A（沒寫 `PORT`）燈條就接 B，寫了 `#define PORT B` 燈條就接 A。

| 功能 | 說明 |
| --- | --- |
| `STRIP` | 燈條有幾顆燈（就是開頭 `#define` 的數字）。走過每一顆用 `for (int i = 0; i < STRIP; i++)`，不要把顆數寫死 |
| `strip.dot(i, 顏色)` | 點亮第 i 顆：0 是接板子的那一頭，最後一顆是 `STRIP - 1`。可以有小數（四捨五入），超出燈條會自動忽略 |
| `strip.fill(顏色)` | 整條同一個顏色 |
| `strip.clear()` | 整條熄滅 |
| `strip.fade(k)` | 整條變暗成 k 倍（0–1），每格呼叫就有拖尾 |
| `strip.brightness(k)` | 燈條的亮度 0–1，沒寫是 0.6。跟燈板的 `brightness()` 分開設，互不影響 |

- 燈條跟燈板一樣每一格重畫，最後那一次 `show()` 會把燈板和燈條一起送出，不用另外呼叫別的。顏色（`rgb()`、`hsv()`、`dim()`）、`seconds()`、旋鈕、按鈕、聲音、傾斜都照用。
- 不要自己開 `Adafruit_NeoPixel`、不要設定腳位：寫了 `STRIP` 之後，`strip` 這個名字和燈條的接口都是函式庫的，自己再宣告會編譯失敗。
- 燈條是一直線：只有「第幾顆」，沒有 x、y。燈條繞成一圈時，第 0 顆和最後一顆是相鄰的，要繞圈跑的東西位置用 `fmodf(位置, STRIP)` 繞回來。
- 光點跑得快時一格會跳過好幾顆：把上一格的位置記下來，這一格從上一格的位置畫到現在的位置（見下面的範例），尾巴才不會斷。
- 燈條和燈板共用電源：板子會自動把整體調暗到安全的範圍，燈條亮得越多，燈板也會跟著暗一點；接電腦時整體比較暗，接充電器才亮。氛圍燈不用整條全白全亮，飽和的顏色、只亮一部分比較好看。
- 預覽：工具頁燈板預覽下面有「燈條預覽」，請學員點開才看得到（畫成一直線）。

```cpp
// 流星燈條
// @desc 燈條上一顆流星拖著尾巴跑，燈板跟著同一個顏色呼吸；旋鈕調速度、按鈕 1 換成整條彩虹
#define PANEL 8              // 燈板：8（8×8）或 16（16×16）
#define STRIP 60             // 另一個接口接了一條 60 顆的燈條
#include "BatoPixel.h"

bool rainbow = false;        // false＝流星、true＝整條彩虹
float pos = 0;               // 流星現在在第幾顆
float lastT = 0;             // 上一格的 seconds()

void setup() {
  begin();
  strip.brightness(0.5);     // 燈條的亮度（跟燈板分開）
}

void loop() {
  float t = seconds();
  float dt = t - lastT;                                   // 跟上一格差幾秒
  lastT = t;
  if (button1.clicked()) { rainbow = !rainbow; strip.clear(); }
  float hue = t * 40;                                     // 顏色慢慢換
  float speed = 10 + knob.value() * 110;                  // 旋鈕：流星每秒跑幾顆

  if (rainbow) {
    for (int i = 0; i < STRIP; i++)                       // 整條一圈彩虹，慢慢流動
      strip.dot(i, hsv(i * 360.0f / STRIP - t * speed, 255, 255));
  } else {
    strip.fade(0.9);                                      // 上一格留下的光慢慢變暗＝尾巴
    float next = pos + speed * dt;
    for (int i = (int)pos; i <= (int)next; i++)           // 從上一格的位置畫到現在的位置，跑得快也不會漏
      strip.dot(i % STRIP, hsv(hue, 200, 255));           // 跑到尾巴就從頭再來
    pos = fmodf(next, STRIP);
  }

  float breath = 0.35f + 0.25f * sinf(t * 2);             // 燈板：同一個顏色慢慢呼吸
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++) dot(x, y, dim(hsv(hue, 255, 255), breath));
  show();                                                 // 燈板和燈條一起送出
}
```

## 錯誤訊息

學員會把工具頁的錯誤訊息貼給你：照訊息裡的行號修改，再給一次完整的程式。

- 「不能用 delay()」：改成用 `seconds()` 算現在該畫什麼（見上面「有先後順序的動畫」）。
- 「預覽停住了」：`loop()` 裡有迴圈在等時間、等聲音、傾斜、按鈕或等蜂鳴器響完，或在迴圈裡一直呼叫 `show()`。
- 「用了 tone()」、「蜂鳴器不用 tone()」：改用 `buzzer.beep(頻率, 秒)`、`buzzer.tone(頻率)`、`buzzer.off()`，蜂鳴器的腳位設定（`pinMode()` 等）整個刪掉。
- 「宣告了叫 buzzer（或 button1…）的變數」、「#include "pitches.h" 要刪掉」：刪掉那一行，直接用函式庫的 `buzzer`、`button1`、`NOTE_C7`。
- 「宣告了叫 strip 的變數」、「自己開的 Adafruit_NeoPixel 接在燈條的接口」：程式開頭已經寫了 `#define STRIP`，刪掉自己開的 `Adafruit_NeoPixel`（和它的 `begin()`、`show()`、`setPixelColor()`），改用 `strip.dot()`、`strip.fill()`。「STRIP 是燈條有幾顆燈」：`#define STRIP` 後面要寫 1–300 的數字。
- 「⚠」開頭的提醒：照提醒補上 `begin()`、`show()`，或把 `PANEL` 改成學員的燈板；提醒「`buzzer.beep()` 的長度單位是秒」就把毫秒改成秒（200 改成 0.2）。
- 學員說「預覽沒有聲音」：請他先在工具頁上隨便點一下（瀏覽器規定點過頁面才能出聲），程式不用改。學員說「板子上聲音很小」：把音移到第 7 個八度。

## 存成範例（你能直接存檔時）

- 8×8 存成 `examples/8x8/我的範例/<名稱>.ino`，16×16 存成 `examples/16x16/我的範例/<名稱>.ino`。檔名就是工具頁卡片上的名稱，可以用中文。
- 開頭兩行註解照「規則 1」寫，卡片會顯示 `@desc` 那句話；動畫有固定循環的話再加一行 `// @loop 秒數`，縮圖會取這一段。
- 不要改 `examples/` 裡其他資料夾的官方範例，也不要改 `BatoPixel.h`。學員重新整理工具頁就會看到新的範例。

## 進階：多接一片燈板

要多接的是燈條時用上面的「接一條燈條」（`#define STRIP`），不要用這一節的寫法；寫了 `#define STRIP` 之後另一個接口就是燈條的，不能再多接燈板。

主燈板接在 A（或用 `#define PORT B` 改成 B），由函式庫控制；多接的燈板要接另外那個接口（A＝GPIO 2、B＝GPIO 3），接到主燈板的接口會編譯失敗。自己開一個 `Adafruit_NeoPixel`，例如 `Adafruit_NeoPixel panelB(64, 3, NEO_GRB + NEO_KHZ800);` 接 B 接口，在 `setup()` 的 `begin();` 後面加 `panelB.begin();`，之後用法跟 Adafruit 的範例一樣（`setPixelColor()`、`panelB.show()`）。預覽只會顯示主燈板；多開的燈板不在自動限流裡，請用 `panelB.setBrightness(20);` 壓低亮度。
