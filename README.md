# Babit — 點陣動畫工具（學員版）

巴比特燈板的動畫創作工具（電子體驗課配套）：學員在工具頁貼上完整的 Arduino 程式，按「▶ 執行」看網頁預覽、按「⚡ 燒錄到板子」放進燈板。
燈板：ESP32-S3 SuperMini、8×8／16×16 WS2812、麥克風（INMP441）、傾斜感測（QMI8658C）、一顆旋鈕、兩顆按鈕（用途由學員程式決定）。
規格與開發計畫見 Obsidian vault：`PRD_點陣動畫工具MVP.md`（「附加：學員版改版 babit」）；實作計畫在 `docs/superpowers/plans/`。

## 安裝（學員電腦）

1. 插上隨身碟（裡面有「babit安裝包」資料夾：Windows、Mac Apple 晶片、Mac Intel 三份工具鏈，約 6.5 GB）。
2. 貼上一行指令（只從 GitHub 下載幾 MB 的程式，工具鏈全部從隨身碟裝）：
   - Windows（開「PowerShell」）：`powershell -ExecutionPolicy Bypass -Command "iex ((irm https://raw.githubusercontent.com/Howard-Chen/babit/main/install.ps1).TrimStart([char]0xFEFF))"`（TrimStart 拿掉檔頭的 BOM，不然開頭會冒一段紅字）
   - Mac（開「終端機」）：`curl -fsSL https://raw.githubusercontent.com/Howard-Chen/babit/main/install.sh | bash`
   - 或按兩下安裝包裡的 `Windows安裝.bat`／`Mac安裝.command`（來源在 `usb/`，改了要複製到安裝包）：做的事一樣，安裝包就用它所在的資料夾
3. 裝在 `C:\babit`（Mac：`~/babit`），工具鏈在裡面的 `tools/`（不進版控）。電腦要有約 11 GB 空間（裝完約 8.5 GB；安裝程式一開始會先檢查）。安裝包放在電腦硬碟上實測約 2 分鐘，從隨身碟裝視隨身碟速度再多幾分鐘。完成後桌面有 babit 捷徑：按兩下會先自動更新（`git pull`），再啟動編譯站、打開工具頁。
   - 隨身碟比學員少：要用的壓縮檔先全部複製到電腦，複製完就顯示「隨身碟用完了，可以拔下來給下一位同學」，解壓縮和第一次編譯在拔掉之後做。安裝程式先把工作位置換到電腦上，兩個雙擊檔也不會再回隨身碟讀自己。
4. 重裝或補裝：同一行指令再跑一次，已經裝好的部分會略過。

> Mac 版（`install.sh`、`babit.command`）尚未在 Mac 上實測。

## 學員程式

```cpp
// 彩虹流動
// @desc 每一格的色相由位置決定，整面彩虹持續流動
#define PANEL 8              // 燈板：8（8×8）或 16（16×16）
#include "BatoPixel.h"

void setup() {
  begin();                   // 啟動燈板、麥克風、傾斜感測、旋鈕
}

void loop() {                // 每 1/60 秒執行一次，每次畫出「現在這一格」
  float t = seconds();       // 開機後第幾秒，動畫都用它來算
  for (int y = 0; y < HEIGHT; y++)
    for (int x = 0; x < WIDTH; x++)
      dot(x, y, hsv((x + y) * 20 + t * 100, 255, 255));
  show();                    // 送出這一格，並自動等到下一格的時間
}
```

規則、可用的函式與範例寫在 [AGENTS.md](AGENTS.md)。它就是「給 AI 的說明書」：工具頁「📋 複製給 AI 的說明」複製的就是這份；學員在這個資料夾用本機 AI 時，AI 會自己讀到（Claude Code 經由 CLAUDE.md 引用）。

**除錯模式**：工具頁按「🔧 除錯模式」，編輯區載入「感應器檢查」（程式改過時按取消就保留自己的程式），右邊的燈板預覽換成序列埠文字視窗：沒接板子時顯示預覽程式的 `Serial` 輸出；按 ⚡ 燒錄後自動接上同一個序列埠（Web Serial，115200），顯示板子印出來的文字，已經燒好的板子按「連線板子」。板子的 `begin()` 把 USB 序列埠的送出等待關掉，沒人讀時 `Serial.print` 不會讓動畫頓。

同一份程式兩邊跑：預覽端（emcc／WASM）先跑 `setup()`，之後每 1/60 秒跑一次 `loop()`；板子端是一般的 Arduino 程式，`show()` 送出畫面後等到下一格，順便讀聲音、傾斜、旋鈕、按鈕。`delay()` 在編譯時擋下（中文錯誤訊息，學員貼給 AI 改）。預覽偵測到 `loop()` 裡用迴圈等時間、或把 `show()` 寫在迴圈裡，會停下並說明；少了 `begin()`／`show()`、一次 `loop()` 呼叫多次 `show()` 會跳提醒（預覽看起來正常，板子上會出問題）。

## 檔案

```
BatoPixel.bat            開發機的一鍵啟動器（桌面捷徑指向它）：編譯站＋開瀏覽器；
                         ping 得到燈板才順便啟動 Art-Net 橋。已在執行就不重複啟動。燈板 IP 改檔案開頭的 PANEL=
babit.bat                學員啟動器（Windows，安裝程式建的桌面捷徑指向它）：可攜版 git 自動更新 → 用 emsdk 的 node
                         啟動編譯站 → 開工具頁。BATOPIXEL_PORT 改連接埠、BABIT_NO_BROWSER=1 不開瀏覽器（測試用）
babit.command            學員啟動器（Mac，同上；安裝程式在桌面放它的連結）
install.ps1、install.sh  學員安裝程式（Windows／Mac）：工具鏈從隨身碟「babit安裝包」離線裝進 tools/，程式用可攜版 git
                         下載，最後先編一次預熱。BABIT_DEST／BABIT_PACK／BABIT_REPO／BABIT_BRANCH／BABIT_NO_SHORTCUT 可改設定
tools/                   安裝程式放的工具鏈：git、arduino-cli（＋ arduino-cli.yaml、arduino/）、emsdk（不進版控）
usb/                     隨身碟「babit安裝包」最上層的兩個雙擊檔（Windows安裝.bat 只能用 ASCII＋CRLF），改了要複製到安裝包
tests/                   安裝程式與啟動器的情境測試（見下方「測試」）；fake_raw.js 在本機模擬 GitHub raw
icon.ico                 啟動器圖示（4×4 點陣，桌面好認）
AGENTS.md                給 AI 的說明書：學員程式的格式、規則、函式、四個完整範例（CLAUDE.md 引用它）
firmware/
  build.ps1              命令列編譯＋燒錄（備援）：.\build.ps1 [COM埠號]，編的是 BatoPixelS0.ino
  BatoPixelS0/
    BatoPixel.h          函式庫，單檔雙目標（板子／WASM 以 __EMSCRIPTEN__ 切換）：PANEL／PORT、begin()／show()／seconds()、
                         畫圖、聲音 audio、傾斜 tilt、旋鈕、電源判斷與限流；delay() 在檔案最後擋下
    BatoPixelS0.ino      預設程式（彩虹），給 build.ps1 與 preview/build_wasm.ps1
  panel_tests/           新燈板接線測試（貼到工具頁）：walk.ino 單燈逐顆、corners.ino 三角定位；
                         sensors.ino「感應器檢查」＝工具頁除錯模式載入的程式（每 0.2 秒用 Serial 印出各感應器的數值）
preview/
  wrapper.cpp            WASM 包裝層：#include 學員程式（student.cpp），第一格跑 setup()、之後每格跑 loop()；
                         記下少 begin()／show()、多次 show() 給網頁提醒
  build_wasm.ps1         單獨建置預設程式的 WASM（輸出 web/，不進版控），給 index.html 與 test_node／test_audio
  index.html             獨立 canvas 預覽（除錯用，需先 build_wasm.ps1）
  test_node.js           繪圖數值驗證
  test_audio.js          聲音頻段與旋鈕倍率驗證
  test_arduino.js        Arduino 相容層數值語意驗證（需編譯站）：「編譯得過」不等於「算得對」
station/
  server.js              編譯站（零相依 node）：工具頁、編譯（預覽／韌體）、範例庫、新增範例、縮圖、給 AI 的說明
  toolpaths.js           找工具鏈：環境變數 → 安裝資料夾的 tools/ → 開發機的位置（Windows／Mac 的執行檔名稱與 PATH 不同）
  sketch_prep.js         學員程式的文字處理：編譯前檢查（中文說明）、預覽端補函式原型（Arduino 會自動做）
  catalog.js             範例庫規則：掃資料夾、分類、標題、id、範例名稱檢查
  thumb.js               把預覽模組跑成卡片縮圖（28 格 sprite，每格 0.1 秒）
  thumb_worker.js        縮圖在另一個執行緒跑，學員的程式卡住也拖不垮編譯站
  load_module.js         在 node 裡載入預覽模組（縮圖與測試共用）
  app.html               工具頁
  run_station.ps1        啟動編譯站 → http://localhost:8930
  vendor/esptool-bundle.js  esptool-js 0.5.7（本地資產，含 UsbJtagSerialReset）
  test_*.js              驗收測試（見下方「測試」）
  cache/                 學員範例的縮圖快取（不進版控）
examples/
  8x8/、16x16/           範例庫（見下方「範例」）
  build_thumbs.js        產生官方範例的縮圖（需編譯站）
  test_examples.js       官方範例雙目標驗收（需編譯站）
  cn_font.py             產生中文點陣字型表：py examples\cn_font.py "句子"（需 Pillow 與 Noto Sans TC），印出的字型表整段貼進範例的 FONT[]
  gif/                   範例區塊合成無縫循環 GIF（行銷用）：node examples/gif/gen_gallery_gif.js 1.5 <輸出資料夾>
  png.js                 極簡 PNG 編碼／解碼
bridge/                  ── Art-Net 橋（本地展示用，與編譯站分離；學員用不到）
  server.js              瀏覽器 8×8 畫面 → 2×2 放大 → 燈序查找表 → GRB → 2 個 universe → UDP 6454
  config.json            控制器設定（已實測：廣播 192.168.0.255、universe 1–2 補滿 512、GRB、右上起點橫列蛇行）
                         brightness 燈板總亮度（預設 0.25）；maxCurrentMa 電流上限（預設 2000）——超過就整張等比壓低，
                         工具頁「燈板」旁的拉桿可即時改亮度並顯示估算安培數；持久值改這個檔
  cmd.js                 映射判定用測試指令：pixel／raw／fill／sweep／marks／config／blackout／status
  test_udp.js            不用硬體的協定層驗證（本機監聽 6454）
  run_bridge.ps1         啟動橋 → ws://127.0.0.1:8940
```

## 編譯站 API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/` | 工具頁 |
| POST | `/compile/preview` | 學員的 .ino → 檢查格式 → 補函式原型 → emcc → `{ok, js, ms}` 或 `{ok:false, log}` |
| POST | `/compile/firmware` | 學員的 .ino → arduino-cli → `{ok, key, ms, size}`；`GET /firmware/<key>` 取韌體。一次編一個；`?bg=1`＝工具頁的背景預編，排隊中的被更新的取代（回 `{ok:false, superseded:true}`），按燒錄不用等前面一長串 |
| GET | `/examples?size=8` | 範例清單 `[{id, title, desc, category, mine, thumb}]`（依分類排好，「我的範例」在最後；`mine`＝學員自己的） |
| GET | `/example?id=…` | 範例原始碼 |
| PUT | `/example?id=…` | 存回學員自己的範例（內容＝程式；工具頁「💾 存回」、Ctrl+S）。只限「我的範例」，官方範例 403，PANEL 跟範例尺寸不符 400 |
| DELETE | `/example?id=…` | 刪除學員自己的範例（工具頁「🗑 刪除」，先問、程式留在編輯區）。只限「我的範例」 |
| GET | `/thumb?id=…` | 縮圖 PNG（官方範例用旁邊的 .png；其他的由編譯站產生、快取在 `station/cache/`） |
| POST | `/examples` | 新增範例 `{size, name, code, overwrite?}` → 存到 `examples/<尺寸>/我的範例/<name>.ino` |
| GET | `/ai-guide` | AGENTS.md 的內容 |
| GET | `/debug-sketch` | 除錯模式的「感應器檢查」程式（`firmware/panel_tests/sensors.ino`） |

## 日常開發

- 桌面按 **BatoPixel** 捷徑（或專案裡的 `BatoPixel.bat`）：起編譯站並開 http://localhost:8930，貼碼按執行。命令列備援：`station\run_station.ps1`。
- 開發時另開一個編譯站，不影響正在用的那個：`BATOPIXEL_PORT=8939 node station/server.js`，測試前面加 `BATOPIXEL_STATION=http://127.0.0.1:8939`。暫存資料夾依連接埠分開（`station/tmp/<連接埠>/`）。
- 工具鏈：arduino-cli（`C:\Program Files\Arduino CLI\`）＋ ESP32 core 3.3.11 ＋ Adafruit NeoPixel；Emscripten（`D:\CSH\CODE\emsdk`，node 隨附）。學員安裝的版本放在 `tools/`，編譯站先找那裡（`station/toolpaths.js`，啟動時印出用了哪些工具）。路徑可用 `BATOPIXEL_EMSDK`、`BATOPIXEL_ARDUINO_CLI`、`BATOPIXEL_FQBN` 改。
- 用 fetch 的測試結尾設 `process.exitCode`、不呼叫 `process.exit()`：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）。

## 測試

```
node station/test_sketch_prep.js        學員程式前處理與格式檢查（不需編譯站）
node station/test_catalog.js            範例庫規則（不需編譯站）
node station/test_tools.js              找工具鏈：Windows 安裝、開發機、Mac、環境變數、找不到時的中文訊息（不需編譯站）
node station/test_fw_queue.js           韌體編譯排隊：背景預編只留最新的一個、燒錄不會被取代（不需編譯站）
powershell -ExecutionPolicy Bypass -File preview/build_wasm.ps1
node preview/test_node.js               繪圖數值
node preview/test_audio.js              聲音頻段與旋鈕倍率
（以下需要編譯站）
node preview/test_arduino.js            Arduino 相容層的數值語意
node preview/test_inputs.js             旋鈕、按鈕、亮度、麥克風靈敏度（兩端編譯、預覽逐格驗證）
node station/test_compile.js            格式錯誤與 delay() 的中文訊息、行號、預覽卡住保護、提醒（兩端編譯）、背景預編被取代
node station/test_examples_api.js       範例庫、新增範例、縮圖
node station/test_ai_guide.js           AGENTS.md 的程式兩端都編得過、跑起來沒有提醒
node station/test_debug.js              除錯模式的感應器檢查程式：拿得到、兩端編得過、預覽印出各項數值
node examples/test_examples.js          官方範例雙目標驗收＋縮圖是最新的（拼圖 examples/preview.png）
node station/test_ui.js                 工具頁操作（puppeteer，預設借 D:/CSH/Design 的；BATOPIXEL_PUPPETEER 可改）
（情境測試：需要桌面的 babit安裝包與開發機的 git、node，各跑幾分鐘）
powershell -ExecutionPolicy Bypass -File tests\install_win.ps1    安裝程式：下載失敗後重跑、解壓到一半、中文帳號、一行指令、照提示中途拔隨身碟（subst 模擬；加 u3 另做一次全新安裝，約 8 GB）
powershell -ExecutionPolicy Bypass -File tests\launcher_win.ps1   啟動器：更新到自己的新版、編譯站啟動失敗時視窗留著
bash tests/install_mac.sh                                         Mac 安裝程式與啟動器（在 Git Bash 用假的安裝包模擬，含中途拔隨身碟）
```

## 範例

- `examples/8x8/`、`examples/16x16/`：子資料夾＝分類（工具頁分組顯示，開頭的編號 `1_` 不顯示），`.ino` 檔名＝卡片標題（開頭的編號 `01_` 不顯示）。
- 檔頭：`// @desc 一句話`＝卡片說明；`// @loop 秒數`＝縮圖取的循環長度（預設 2.8）。
- 新增官方範例：放進分類資料夾 → `node examples/build_thumbs.js`（在旁邊產生同名 .png）→ `node examples/test_examples.js`。不必改編譯站或頁面。
- `我的範例/`：學員用「＋ 新增範例」存的（或 AI 直接寫進去的），不進版控，縮圖由編譯站產生。官方範例不要直接改，改了 `git pull` 會衝突。

## 硬體（固定在 BatoPixel.h）

**接線**：色序 GRB、逐行（第 0 顆在左上，8×8 實測）、麥克風 I²S 5／6／7、IMU I²C 11／12、旋鈕 GPIO1、按鈕 GPIO8／9（按下接地、內部上拉），都是巴比特燈板 PCB 的固定接線。學員只在程式裡選燈板（`#define PANEL 8／16`）與接口（`#define PORT A／B／C`＝GPIO2／3／4，沒寫＝A）。**電源**：板子用 USB 那一端有沒有電腦判斷電源——接電腦＝亮度上限 20、電流上限 500 mA；連續 2 秒沒有電腦＝PD 供電，亮度上限 160、電流上限 2500 mA；亮度預設 60%（學員程式可用 `brightness(k)` 改）乘上當下上限，超過電流上限就整張等比調暗。預覽不套亮度上限與限流，只照 `brightness()` 相對預設值調暗。**傾斜**：`tilt.x()`／`tilt.y()` 是畫面右／下方向的重力（g），沒有 IMU（預覽或沒接）時給左右搖擺的模擬值，`tilt.ready()` 表示真的有 IMU。**旋鈕與按鈕**：用途由學員程式決定，函式庫不會自己拿來做事。`knob.value()` 0–1（平滑、加死區、兩端貼齊 0 與 1）；`button1`／`button2` 的 `pressed()`（按著）與 `clicked()`（剛按下那一格），每格讀一次、連續兩格一樣才算數（去彈跳）。預覽用預覽畫面下方的滑桿與按鈕。**麥克風靈敏度**：`audio.sensitivity(k)`（0–1）照音樂節原型對數映射成倍率 1/16–16（0.5＝1），除在雜訊閘、滿版參考音量與節拍門檻上，沒設定是 1；FFT 範例用 `audio.sensitivity(knob.value())` 讓旋鈕調。板子的雜訊閘 0.002、滿版參考音量 0.02；預覽維持雜訊閘 0.01、只用自動增益。**多開燈板**：學員可在程式裡自己開 `Adafruit_NeoPixel` 接其他接口（例：`Adafruit_NeoPixel panelB(64, 3, NEO_GRB + NEO_KHZ800);`）；預覽端有同名空殼讓程式編得過，只畫主燈板；多開的燈板不在亮度上限與限流裡。

## 新燈板接線測試

1. 工具頁貼上 `firmware/panel_tests/walk.ino`（第一行改成燈板的尺寸）→ ⚡ 燒錄。藍點照實體燈號一顆一顆走，用 `arduino-cli monitor -p COM埠號 -c baudrate=115200` 看燈號。記下第 0 顆在哪個角、第二排是跳回同側（逐行）還是折返（蛇行）。
2. 依觀察改 `BatoPixel.h` 的 `BP_SERPENTINE`／`BP_TRANSPOSE`（第 0 顆不在左上時，要在 `bp_index` 加換算）。
3. 貼上 `firmware/panel_tests/corners.ino` 驗證：左上紅、右上綠、左下藍。

## 已知坑

- **.ps1 必須存 UTF-8 with BOM**：PowerShell 5.1 在繁中 Windows 把無 BOM 的 .ps1 當 ANSI 讀，中文註解位元組錯拆會產生假引號、打亂指令參數（實際症狀：upload 報 `accepts at most 1 arg(s), received 2`，錯誤訊息完全不指向編碼）。細節見 vault `規格文件_點陣動畫開發工具.md`「開發紀錄：踩過的坑」。
- USB-C 線要能傳資料，充電專用線看不到 COM 埠。
- 安裝路徑要是英文：中文路徑會讓板子端編譯失敗。
- 燈序：官方 NeoMatrix 宣告 TOP＋RIGHT＋COLUMNS＋PROGRESSIVE；本函式庫用 `BP_TRANSPOSE`／`BP_SERPENTINE` 旗標對應，以三角定位（corners.ino）為準。
