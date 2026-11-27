# Babit — 點陣動畫工具（學員版）

巴比特燈板的動畫創作工具（電子體驗課配套）：學員在工具頁貼上完整的 Arduino 程式，按「▶ 執行」看網頁預覽、按「⚡ 燒錄到板子」放進燈板。
燈板：ESP32-S3 SuperMini、8×8／16×16 WS2812、麥克風（INMP441）、傾斜感測（QMI8658C）、一顆旋鈕、四顆按鈕、一顆蜂鳴器（用途由學員程式決定）。按鈕 3、4 與蜂鳴器是第三版 PCB（2026-11）加的；第一、二版的板子只有按鈕 1、2，同一份程式照樣能跑（按鈕 3、4 讀到沒按、蜂鳴器不出聲）。
規格、決議與待做事項見 Obsidian vault：`PRD_巴比特燈板課程工具.md`；實作計畫在 `docs/superpowers/plans/`。

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

**除錯模式（零件檢查）**：工具頁按「🔧 除錯模式」，編輯區載入「零件檢查」（`firmware/panel_tests/sensors.ino`；程式改過時按取消就保留自己的程式），右邊多一個序列埠文字視窗。還沒接板子時顯示預覽程式的 `Serial` 輸出，燈板預覽縮小留在上面；按 ⚡ 燒錄後自動接上同一個序列埠（Web Serial，115200），顯示板子印出來的文字，已經燒好的板子按「連線板子」。接著板子時，預覽的燈板、旋鈕按鈕那一排都收起來，預覽的蜂鳴器也不出聲（看的、按的、聽的都是板子）。載入時 `PANEL` 換成目前的燈板尺寸；原本的程式有寫 `#define PORT B` 就一起帶過來（接口不對燈板會全黑）。除錯模式開著時切換 8×8／16×16，編輯區換成新尺寸的零件檢查（不是換成範例）；點範例卡片就離開除錯模式——不然「除錯模式」的燈還亮著，按燒錄燒進去的卻是範例（2026-11-24 實機踩到）。

板子的 `begin()` 把 USB 序列埠的送出等待關掉（沒人讀時 `Serial.print` 不會讓動畫頓），送出的暫存區加大到 2048 位元組：預設只有 256，放不進去的就丟掉，一格裡印兩三行中文（一個字 3 位元組）後半段就不見了。

「零件檢查」是課堂上「每個零件都試一次」那個環節用的（2026-11 有學員回家才發現麥克風沒用）：

- 燈板分成八塊，一塊檢查一個零件：四個角落＝按鈕 1–4（亮點的數目＝第幾顆，跟板子上的位置一樣 1、2 在上，3、4 在下；按下去那一塊變白、嗶一聲，四顆音高不同）、橫的長條＝旋鈕、中間左＝麥克風、正中間＝蜂鳴器、中間右＝傾斜（白點像彈珠，滾到低的那一邊）。16×16 是同樣的八塊，塊跟塊之間留一排不亮。
- 顏色：暗的＝還沒試，綠色＝過關，紅色一閃一閃＝偵測到沒接好，白色＝正按著或正在響。全部過關整面放彩虹、唱一段音樂。開機先整面亮紅、綠、藍、白各 0.4 秒（看燈板有沒有壞點、顏色對不對）。8×8 的蜂鳴器左右緊貼著麥克風和傾斜，都閃紅時蜂鳴器跟那兩塊錯開來閃。
- 過關的條件：按鈕＝按到一下；旋鈕＝轉到過最左和最右；麥克風＝安靜和大聲都出現過（音量最小和最大差 0.45 以上；一直沒聲音、或沒接好一直滿格都不算）；傾斜＝往四個邊各斜過（x、y 各到過 ±0.5 g）；蜂鳴器＝偵測到線路有通、而且叫它響過（聲音有沒有出來要人聽）。
- 偵測得到的沒接好（那一塊閃紅、清單上是紅格、文字說明要檢查哪裡）：蜂鳴器（開機時讀 GPIO10：有蜂鳴器會被拉到地）、傾斜感測器（I²C 沒回應；這時不畫白點、不印數值——函式庫給的是模擬的搖擺）、旋鈕中間腳沒接好、按鈕一直是按著的（連續 3 秒：卡住或焊錫連在一起）、麥克風（見下一條）。
- 麥克風沒焊好時 I²S 照樣讀得到資料，只是一直是 0 或亂碼，所以只看「有沒有在收音」抓不到。板子上超過 20 秒都沒聽到聲音標「✗ 沒聽到聲音」（說明先拍手、還是沒有就檢查焊點；教室只是很安靜的話，拍一下手就收起來），超過 10 秒一直滿格標「✗ 一直滿格」；I²S 沒起來標「✗ 沒有啟動」（跟焊點無關，請學員按 RESET）。預覽用的是電腦的麥克風，不標 ✗。焊不好的麥克風實際讀到什麼還沒有實機量過。
- 第一、二版的板子沒有按鈕 3、4 與蜂鳴器，偵測不出是「舊板子」還是「第三版但蜂鳴器沒焊好」，所以預設照第三版算（8 項）：沒偵測到蜂鳴器就是沒過關，不會自己猜是舊板子。舊板子把程式開頭的 `OLD_BOARD` 改成 1 再燒（沒偵測到蜂鳴器時文字會這樣提示；按得到按鈕 3 或 4 之後就只講檢查焊點），這時只算它有的 5 項（預覽 4 項），按鈕 3、4 和蜂鳴器那三塊不畫、現況和說明都不提。程式有寫 `#define PORT C`（只有第一、二版有 C 接口）也自動當成舊板子。
- 文字：每半秒印一行現況（`零件檢查 2/8｜按鈕 1 ✓ 2 … 3 … 4 …｜旋鈕 … 0.42（原始 1720，跳動 9，腳位接好）｜麥克風 … 音量 0.12｜傾斜 ✗ 沒偵測到｜蜂鳴器 ✓`），另外偶爾印：每一塊是什麼和顏色的意思（開機 20 秒內印三次，之後 30 秒一次——燒完之後工具頁要幾秒才接上，第一次常常沒收到）、哪一項剛過關、哪裡沒接好、還有哪些沒過（有變就印，不然 10 秒一次）。一格畫面印的字不超過 250 位元組（測試會算），就算暫存區沒加大也送得完。
- 工具頁不把現況那一行放進文字視窗，畫成釘在文字視窗上面的「零件清單」：一個零件一格（✓ 綠、✗ 紅、… 還沒試，後面是現在的讀值或原因），括號裡的細節（旋鈕的原始讀值、跳動、腳位）在下面一行小字；標題寫明是「預覽的」還是「板子的」（預覽沒有傾斜感測器，算 7 項；預覽的 7／7 不代表板子過關）；3 秒沒收到現況就收起來。小螢幕的筆電（1366×768、1280×720）燈板預覽和文字視窗跟著畫面高度縮小，旋鈕按鈕那一排和音量儀表不用捲動就看得到。按「中斷」之後，序列埠關好之前「連線板子」先不能按（連點兩下不會跳出選序列埠的視窗）。板子的文字是一段一段送進來的，半行先留著等收完；不是現況的半行馬上顯示（學員的程式可能用 `Serial.print` 不換行）。
- 板子才會走到的那幾段（一定要有傾斜感測器、板子用的說明文字）測試時把程式開頭的 `ON_BOARD` 改成 1，在預覽裡跑（`station/test_debug.js`）。

同一份程式兩邊跑：預覽端（emcc／WASM）先跑 `setup()`，之後每 1/60 秒跑一次 `loop()`；板子端是一般的 Arduino 程式，`show()` 送出畫面後等到下一格，順便讀聲音、傾斜、旋鈕、按鈕。`delay()` 在編譯時擋下（中文錯誤訊息，學員貼給 AI 改）；Arduino 的 `tone()`／`noTone()` 也一樣擋下（見下面「硬體」的蜂鳴器）。預覽偵測到 `loop()` 裡用迴圈等時間、或把 `show()` 寫在迴圈裡，會停下並說明；少了 `begin()`／`show()`、一次 `loop()` 呼叫多次 `show()`、`buzzer.beep()` 的秒數超過 10（多半是把毫秒當成秒）、蜂鳴器的音低於 1000 Hz（板子上很小聲，預覽聽不出來）會跳提醒（預覽看起來正常，板子上會出問題）。

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
AGENTS.md                給 AI 的說明書：學員程式的格式、規則、函式、五個完整範例（CLAUDE.md 引用它）
firmware/
  build.ps1              命令列編譯＋燒錄（備援）：.\build.ps1 [COM埠號]，編的是 BatoPixelS0.ino
  BatoPixelS0/
    BatoPixel.h          函式庫，單檔雙目標（板子／WASM 以 __EMSCRIPTEN__ 切換）：PANEL／PORT、begin()／show()／seconds()、
                         畫圖、聲音 audio、傾斜 tilt、旋鈕 knob、按鈕 button1–4、蜂鳴器 buzzer、電源判斷與限流；delay() 在檔案最後擋下
    BatoPixelS0.ino      預設程式（彩虹），給 build.ps1 與 preview/build_wasm.ps1
  panel_tests/           新燈板接線測試（貼到工具頁）：walk.ino 單燈逐顆、corners.ino 三角定位；
                         sensors.ino「零件檢查」＝工具頁除錯模式載入的程式（燈板分成八塊，一塊檢查一個零件，見上面「除錯模式」）
  arduino_export/        「匯出 Arduino 資料夾」打包進 zip 的東西：README.txt（給學員的 Arduino IDE 步驟）、
                         src/Adafruit_NeoPixel/（燈條函式庫 1.15.5 的原始碼，LGPL-3.0，授權條款 COPYING 一起附）
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
  sketch_prep.js         學員程式的文字處理：編譯前檢查（中文說明；含「程式不能讀電腦上的檔案」的規則）、預覽端補函式原型（Arduino 會自動做）
  deps_check.js          編譯完核對編譯器實際讀了哪些檔案（第二道保險，見「安全」）
  catalog.js             範例庫規則：掃資料夾、分類、標題、id、範例名稱檢查
  target.js              現在是哪個部署目標、哪一版（開發版／離線版／雲端版；版本檔 version.json 或 git），見「三個部署目標」
  gate.js                誰送來的請求才收：只給這台電腦上的工具頁；雲端版另外收對外的網址、要課堂代碼（見「安全」）
  fw_queue.js            編譯排隊（預覽、韌體各一條）：一次一個；bg 請求只有最新的有用（排隊中的作廢、正在編的韌體停掉）。
                         雲端版同時編好幾份（槽）、每個人各排各的、輪流、每人排隊的份數有上限
  build_cleanup.js       編譯暫存：清掉舊版每編一次就留一份的建置資料夾；韌體編到一半被停掉時刪掉寫了一半的檔案
  arduino_export.js      匯出 Arduino 資料夾／匯入 zip 的打包規則（資料夾結構、名稱規定、匯入時怎麼找出程式與作品名稱）
  zip.js                 最小的 zip 讀寫（零相依，只用 node 內建的 zlib）
  thumb.js               把預覽模組跑成卡片縮圖（28 格 sprite，每格 0.1 秒）
  load_module.js         在 node 裡載入預覽模組（只給官方範例的縮圖產生與測試用；學員的程式不能在 node 裡跑，見「安全」）
  app.html               工具頁
  run_station.ps1        啟動編譯站 → http://localhost:8930
  vendor/esptool-bundle.js  esptool-js 0.5.7（本地資產，含 UsbJtagSerialReset）
  test_*.js              驗收測試（見下方「測試」）
  cache/                 學員範例的縮圖（工具頁算好上傳的，不進版控）
examples/
  8x8/、16x16/           範例庫（見下方「範例」）
  build_thumbs.js        產生官方範例的縮圖（需編譯站）
  test_examples.js       官方範例雙目標驗收（需編譯站）
  cn_font.py             產生中文點陣字型表：py examples\cn_font.py "句子"（需 Pillow 與 Noto Sans TC），印出的字型表整段貼進範例的 FONT[]
  gif/                   範例區塊合成無縫循環 GIF（行銷用）：node examples/gif/gen_gallery_gif.js 1.5 <輸出資料夾>
  png.js                 極簡 PNG 編碼／解碼
cloud/                   ── 雲端版專用（見「三個部署目標」的「雲端版」）
  build.sh               把某個 commit 做成映像（或打包成 tar.gz 傳到雲端主機再建），順便寫入版本檔
  Dockerfile             編譯站的 Linux 映像：工具鏈版本照學員安裝包，建的時候先把預覽與每個韌體槽編過一次（warmup.js）
  compose.yaml           編譯站＋Cloudflare Tunnel（對外的 HTTPS）；env.example 是設定的範本（複製成 .env 再填）
  entrypoint.sh、healthcheck.sh、arduino-cli.yaml   映像裡用的啟動指令、健康檢查、arduino-cli 設定
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
| POST | `/compile/preview` | 學員的 .ino → 檢查格式 → 補函式原型 → emcc → `{ok, js, ms}` 或 `{ok:false, log}`。一次編一個；`?bg=1`＝工具頁按執行送的，排隊中的被更新的作廢（回 `{ok:false, superseded:true}`）；工具頁也會丟掉晚回來的舊結果，連點範例只跑最後一個 |
| POST | `/compile/firmware` | 學員的 .ino → arduino-cli → `{ok, key, ms, size}`；`GET /firmware/<key>` 取韌體。一次編一個；`?bg=1`＝工具頁的背景預編：排隊中的作廢、正在編的也停掉（同一段程式、或排隊中的燒錄要用它時不停）；燒錄送的不帶 bg。固定在 `station/tmp/<連接埠>/fw/sketch` 編，arduino-cli 一直沿用同一個建置資料夾（147：每份約 18 秒，舊版約 35 秒） |
| GET | `/examples?size=8` | 範例清單 `[{id, title, desc, category, mine, thumb}]`（依分類排好，「我的範例」在最後；`mine`＝學員自己的） |
| GET | `/example?id=…` | 範例原始碼 |
| PUT | `/example?id=…` | 存回學員自己的範例（內容＝程式；工具頁「💾 存回」、Ctrl+S）。只限「我的範例」，官方範例 403，PANEL 跟範例尺寸不符 400 |
| DELETE | `/example?id=…` | 刪除學員自己的範例（工具頁「🗑 刪除」，先問、程式留在編輯區）。只限「我的範例」 |
| GET | `/thumb?id=…` | 縮圖 PNG：官方範例用旁邊的 .png；其他的是工具頁上傳過的（存在 `station/cache/`），沒有就回 404。編譯站自己不算縮圖（見「安全」） |
| PUT | `/thumb?id=…&k=…` | 工具頁上傳算好的縮圖（內容＝PNG，上限 200 KB）。`k` 是清單給的 `thumbKey`（程式內容＋函式庫的雜湊）：程式改過就不收（409）；尺寸要是「燈板格數×28」寬、「燈板格數」高 |
| POST | `/examples` | 新增範例 `{size, name, code, overwrite?}` → 存到 `examples/<尺寸>/我的範例/<name>.ino` |
| POST | `/export/arduino?name=…&title=…` | 內容＝程式 → zip：Arduino IDE 可以直接開的資料夾（`<name>/<name>.ino`＋`BatoPixel.h`＋`src/Adafruit_NeoPixel/`＋`README.txt`）。`name` 只能英數字、底線、點、減號（Arduino 的規定），沒給就自動編號；`title`（可省略）是作品名稱，寫進 `README.txt`，不能當範例名稱的就略過；程式格式不對、`name` 不合規定回 400 `{ok:false, error}` |
| POST | `/import/arduino` | 內容＝zip → `{ok, code, title, size, folder}`：找出跟資料夾同名的 `.ino`，作品名稱取 `README.txt` 的「作品名稱：」（沒有就取程式第一行的註解，再沒有用資料夾名稱），尺寸取 `#define PANEL`。只讀不存，上限 2 MB；不能匯入回 400 `{ok:false, error}`（中文原因）。存成範例由工具頁再呼叫 `POST /examples`（同名就加編號，不覆蓋） |
| POST | `/examples/check` | 只檢查 `{size, name, code}` 能不能存成範例（名稱、燈板尺寸），不存 → `{ok, name, code}` 或 400 `{ok:false, error}`。雲端版的工具頁把範例存進瀏覽器之前用，規則跟 `POST /examples` 同一份 |
| GET | `/ai-guide` | AGENTS.md 的內容 |
| GET | `/debug-sketch` | 除錯模式的「零件檢查」程式（`firmware/panel_tests/sensors.ino`） |
| GET | `/version` | 現在是哪個部署目標、哪一版 `{target, label, source, dirty, date}`（`target.js`）。工具頁標題旁邊顯示，例如「雲端版 · 842d964 · 2026-11-20」 |

雲端版不一樣的地方：`POST /examples`、`PUT`／`DELETE /example`、`PUT /thumb` 一律回 403（不存任何人的東西），`/examples` 只列官方範例；GET、HEAD 以外的請求要帶 `X-Babit-Code`（課堂代碼），沒帶或不對回 401 `{ok:false, needCode:true, error}`；編譯請求帶 `X-Babit-Client`（工具頁隨機產生的代號）就每個人各排各的，韌體的結果多一個 `slot`（用了第幾個槽）；一個人排隊超過 8 份回 `{ok:false, busy:true, error}`；編譯要等的時候回應會先送空白（JSON 前面的空白不影響解析）。

## 三個部署目標

同一份程式碼，三個部署目標（正本在 vault 的 PRD「部署目標」一節）。每次改版要講清楚：改的是哪個目標、要部署到哪個目標；commit 與發佈訊息開頭寫明，例如「〔開發版＋離線版〕…」。

| 目標 | 給誰 | 怎麼部署 | 只屬於它的檔案 |
| --- | --- | --- | --- |
| 開發版 | 巴特與 AI | commit 到 main 就生效 | `dev/`、各 `test_*.js` |
| 離線版 | 學員，裝在自己電腦 | `bash dev/publish.sh "說明"` 推到公開 repo（每次要巴特同意），學員開 babit 時更新 | `install.*`、`babit.*`、`usb/` |
| 雲端版 | 學員，上課日用瀏覽器開 | `bash cloud/build.sh` 把某個 commit 做成映像，在雲端主機用 `cloud/compose.yaml` 啟動（每次要巴特同意；步驟在 vault 的「Babit雲端版GCP操作手冊」） | `cloud/` |

共用的核心（`station/`、`firmware/`、`preview/`、`examples/`）只有一份，三個目標的差異用執行模式切換，不各養一份。

**現在跑的是哪個目標、哪一版**：工具頁標題旁邊會顯示（`GET /version`），編譯站啟動時也會印。判斷的規則在 `station/target.js`：repo 根目錄有版本檔 `version.json`（`{"target","source","date"}`）就照它——離線版是 `dev/publish.sh` 發佈時寫的，雲端版是 `cloud/build.sh` 寫的；沒有版本檔就是開發版，版本＝git 的 commit（有還沒 commit 的修改會標出來）。三個目標顯示同一個 commit，就是同一份程式。開發的 repo 不放版本檔（`.gitignore`）。

**程式裡怎麼分**：只屬於某個目標的行為，在共用的檔案裡都用同一個旗標標出來——編譯站是 `server.js` 的 `CLOUD`，工具頁是 `app.html` 的 `CLOUD`（各自檔案開頭的註解列出全部差異）；可以單獨拿出來的邏輯放在自己的檔案（`gate.js`、`target.js`、`fw_queue.js`），用參數決定行為，不看目標。

### 雲端版

整班共用一台主機上的編譯站，學員用瀏覽器開網址就能用，不用安裝。只在上課日開（當天開主機、下課刪掉）。跟離線版不一樣的地方：

- **不存任何人的東西**：自己的範例存在學員瀏覽器的 IndexedDB（工具頁的 `browserStore`；離線版是 `serverStore`，存到 `examples/<尺寸>/我的範例`），縮圖也是。名稱與燈板尺寸的檢查還是問編譯站（`POST /examples/check`），兩邊規則同一份。換電腦、換瀏覽器、清除網站資料就看不到——要帶走用「⬇ 匯出 Arduino 資料夾」。
- **草稿自動存**：編輯區的程式隨時存一份在瀏覽器（localStorage `babit.draft`），重新整理、不小心關掉分頁再開都還在。
- **課堂代碼**：編譯、匯出、匯入要帶（`BATOPIXEL_CLASS_CODE`）；工具頁被擋下時問一次、記在瀏覽器，老師給的網址後面加 `#c=代碼` 就不用問。看頁面與官方範例不用代碼。
- **整班同時用**：韌體同時編好幾份（`BATOPIXEL_FW_SLOTS`，每個槽有自己的建置資料夾 `tmp/<連接埠>/fw-slot<N>`）、預覽也可以（`BATOPIXEL_PREVIEW_SLOTS`）；每個人同時只編一份、輪流、排隊最多 8 份；編太久的程式停掉（預覽 20 秒、韌體 90 秒，離線版是 120／180 秒）；編好的韌體留 64 份（離線版 6 份）。
- **對外**：`BATOPIXEL_BIND=0.0.0.0`、`BATOPIXEL_ORIGINS=https://對外的網址`（Host 與 Origin 都要對）。容器不開連接埠，只經過 Cloudflare Tunnel；編譯站那個容器接的是內部網路，連不到外面。
- 開頁就檢查瀏覽器能不能燒錄（要電腦上的 Chrome 或 Edge）；不連 127.0.0.1 的 Art-Net 橋。

在開發機測雲端模式不用容器：`BATOPIXEL_TARGET=cloud BATOPIXEL_CLASS_CODE=test BATOPIXEL_PORT=8950 node station/server.js`（設定不對會直接說明並結束：雲端版沒設課堂代碼、對外的網址寫錯）。`node station/test_cloud.js`、`node station/test_ui_cloud.js` 就是這樣自己開編譯站測的。

建映像與啟動（細節與 GCP 的步驟在 vault 的操作手冊）：

```
bash cloud/build.sh                  用 HEAD 建 babit-cloud:<commit 前 7 碼>（只收已經 commit 的內容；映像裡寫入版本檔）
bash cloud/build.sh --pack           不建，打包成 babit-cloud-<7 碼>.tar.gz：傳到雲端主機解開，在那裡 docker build
cd cloud && cp env.example .env      填映像版本、對外的網址、課堂代碼、Cloudflare 通道的金鑰
docker compose up -d                 啟動；docker compose logs -f station 看每一份編譯等多久、編多久
```

## 日常開發

- 桌面按 **BatoPixel** 捷徑（或專案裡的 `BatoPixel.bat`）：起編譯站並開 http://localhost:8930，貼碼按執行。命令列備援：`station\run_station.ps1`。
- 開發時另開一個編譯站，不影響正在用的那個：`BATOPIXEL_PORT=8939 node station/server.js`，測試前面加 `BATOPIXEL_STATION=http://127.0.0.1:8939`。暫存資料夾依連接埠分開（`station/tmp/<連接埠>/`）。
- 工具鏈：arduino-cli（`C:\Program Files\Arduino CLI\`）＋ ESP32 core 3.3.11 ＋ Adafruit NeoPixel；Emscripten（`D:\CSH\CODE\emsdk`，node 隨附）。學員安裝的版本放在 `tools/`，編譯站先找那裡（`station/toolpaths.js`，啟動時印出用了哪些工具）。路徑可用 `BATOPIXEL_EMSDK`、`BATOPIXEL_ARDUINO_CLI`、`BATOPIXEL_FQBN` 改。
- 用 fetch 的測試結尾設 `process.exitCode`、不呼叫 `process.exit()`：Windows 上 fetch 的連線還在關閉時硬結束，node 會斷言失敗（exit 127）。

## 測試

整套一次跑完（約 16 分鐘）：先另開開發用的編譯站（8939），再 `bash dev/suite.sh`。只印每個測試的 PASS／FAIL，完整輸出在 `station/tmp/suite/`。跑的時候不要同時開工具頁或另外跑需要編譯站的測試（背景預覽的佇列只留最新的，會互相取消）。個別的測試：

```
node station/test_sketch_prep.js        學員程式前處理與格式檢查、程式不能讀電腦上的檔案的規則、蜂鳴器的常見 Arduino 寫法（tone()、變數叫 buzzer、
                                        pitches.h）的中文說明、很長很怪的程式也要馬上檢查完（不需編譯站）
node station/test_catalog.js            範例庫規則（不需編譯站）
node station/test_tools.js              找工具鏈：Windows 安裝、開發機、Mac、環境變數、找不到時的中文訊息（不需編譯站）
node station/test_fw_queue.js           編譯排隊：bg 只留最新的（排隊中的作廢、正在編的停掉）、燒錄不會被取代（不需編譯站）
node station/test_build_cleanup.js      編譯暫存：只清編譯站自己留下的、停掉時只刪寫了一半的、找建置資料夾（不需編譯站）
node station/test_zip.js                zip 讀寫：來回一致、上限、壞檔與謊報大小的檔、跟 Python zipfile 互通（不需編譯站）
node station/test_arduino_pack.js       匯出資料夾的結構、名稱規定、說明檔與授權條文；匯入時怎麼找程式與作品名稱、哪些 zip 不收（不需編譯站）
node station/test_target.js             現在是哪個部署目標、哪一版：版本檔、git、環境變數的先後，亂寫的內容不照抄（不需編譯站）
node station/test_gate.js               請求把關：Host／Origin 的規則、對外的網址怎麼讀、課堂代碼、請求的代號（不需編譯站）
powershell -ExecutionPolicy Bypass -File preview/build_wasm.ps1
node preview/test_node.js               繪圖數值
node preview/test_audio.js              聲音頻段與旋鈕倍率
（以下需要編譯站）
node preview/test_arduino.js            Arduino 相容層的數值語意
node preview/test_inputs.js             旋鈕、按鈕、亮度、麥克風靈敏度（兩端編譯、預覽逐格驗證）
node preview/test_buttons_buzzer.js     按鈕 3、4 與蜂鳴器：beep／tone／off／playing、NOTE_ 音名、Arduino 的 tone()／noTone() 兩端都擋下、
                                        頻率下限 40 Hz、秒數不是數字、把毫秒當成秒的提醒、腳位（8／9／44／4／10）、等蜂鳴器的迴圈會被預覽停下、
                                        舊程式的 PORT C 照樣編得過（那時兩端都不讀按鈕 4）
node preview/test_pitch.js              音高 audio.pitch()：正弦波與有泛音的聲音量到的頻率（差不到 20 音分）、滑音、聽不出音高時是 0
                                        （安靜、太小聲、雜音、拍手）、70–2000 Hz 的範圍與更高的音量成低八度、兩端編得過
node preview/test_strip.js              燈條（#define STRIP）：strip.dot／fill／clear／fade／brightness 逐格驗證、接口跟著 PORT 換、
                                        燈條算進限流、沒寫 STRIP 的程式不受影響、STRIP 寫錯的中文訊息、兩端編得過
node station/test_compile.js            格式錯誤與 delay() 的中文訊息、行號、預覽卡住保護、提醒（兩端編譯）、背景預編被停掉、固定建置資料夾
node station/test_examples_api.js       範例庫、新增範例、縮圖的上傳與讀取
node station/test_security.js           安全：怪網址不會讓編譯站當掉、只收對著 localhost 送來的請求、會改東西的請求只收工具頁自己送的、
                                        編譯站不執行學員的程式（夾帶 JavaScript 的範例不會在這台電腦上跑）、縮圖上傳的檢查
node station/test_arduino_export.js     匯出 Arduino 資料夾／匯入 zip：端點、把匯出的資料夾放到沒裝任何函式庫的 Arduino 環境實際編譯、
                                        開發板、USB Mode、USB CDC On Boot 選錯時的中文訊息（約 90 秒；快取在 station/tmp）
node station/test_ai_guide.js           AGENTS.md 的程式兩端都編得過、跑起來沒有提醒；蜂鳴器範例的旋律實際播出來每個音都分開；
                                        只看說明書寫程式的 AI 卡住過的地方都有寫到
node station/test_debug.js              除錯模式的零件檢查程式：預覽逐格驗證每一塊的位置與顏色、每一項的過關條件、沒偵測到的零件怎麼顯示、
                                        第一、二版板子的說明、按鈕卡住、每一格印的位元組數、板子才有的狀況（ON_BOARD 改成 1 在預覽跑）、
                                        8×8 與 16×16、兩端編得過
node examples/test_examples.js          官方範例雙目標驗收＋縮圖是最新的（拼圖 examples/preview.png）
node station/test_ui.js                 工具頁操作，含四顆按鈕與蜂鳴器（喇叭發聲、畫面顯示頻率、靜音鍵、點過頁面才出聲、音太低與秒數的提醒）、
                                        除錯模式（縮小的燈板預覽、帶著 PORT、零件清單；假的序列埠模擬板子一段一段送字、拔線、中斷）、
                                        燒完送重開訊號的順序（假的 esptool-js，不需要板子）、匯出 Arduino 資料夾與匯入 zip（puppeteer，預設借 D:/CSH/Design 的；BATOPIXEL_PUPPETEER 可改）
node station/test_ui_strip.js           工具頁的燈條預覽：預設收著、程式有燈條時鈕上的提示、展開後一直線的排法與顏色、亮度、
                                        300 顆折成幾排、開關狀態記得住、除錯模式不顯示（puppeteer）
（以下自己另開雲端模式的編譯站再關掉，連接埠 8945–8949，不用先啟動）
node station/test_cloud.js              雲端模式的編譯站：/version、對外網址與課堂代碼的把關、不寫主機的資料夾、三個槽同時編、
                                        排隊上限、編太久準時停掉（連同編譯器的子程序）、設定不對就不啟動
node station/test_ui_cloud.js           雲端版的工具頁：版本顯示、課堂代碼、範例存在瀏覽器（重新整理還在、別人看不到、主機沒多出檔案）、
                                        草稿自動存、匯入匯出、不能燒錄的瀏覽器開頁就提醒（puppeteer）
（情境測試：需要桌面的 babit安裝包與開發機的 git、node，各跑幾分鐘）
powershell -ExecutionPolicy Bypass -File tests\install_win.ps1    安裝程式：下載失敗後重跑、解壓到一半、中文帳號、一行指令、照提示中途拔隨身碟（subst 模擬；加 u3 另做一次全新安裝，約 8 GB）
powershell -ExecutionPolicy Bypass -File tests\launcher_win.ps1   啟動器：更新到自己的新版、編譯站啟動失敗時視窗留著
bash tests/install_mac.sh                                         Mac 安裝程式與啟動器（在 Git Bash 用假的安裝包模擬，含中途拔隨身碟）
```

## 範例

- `examples/8x8/`、`examples/16x16/`：子資料夾＝分類（工具頁分組顯示，開頭的編號 `1_` 不顯示），`.ino` 檔名＝卡片標題（開頭的編號 `01_` 不顯示）。
- 卡片上只有縮圖和標題，每一組排成兩排（由上而下、再往右）；檔頭：`// @desc 一句話`＝卡片的說明，滑鼠移到卡片上才看得到；`// @loop 秒數`＝縮圖取的循環長度（預設 2.8）。
- 新增官方範例：放進分類資料夾 → `node examples/build_thumbs.js`（在旁邊產生同名 .png）→ `node examples/test_examples.js`。不必改編譯站或頁面。
- `我的範例/`：學員用「＋ 新增範例」存的（或 AI 直接寫進去的），不進版控，縮圖由工具頁算（見「安全」）。官方範例不要直接改，改了 `git pull` 會衝突。
- 官方範例兩種尺寸各六個：`1_基本` 彩虹流動、小綠人、英文跑馬燈（16×16 是中文跑馬燈）、生命遊戲，`2_感測器` 沙漏番茄鐘、FFT 頻譜。彩虹、沙漏、頻譜的 8×8 與 16×16 是同一份程式，只差 `PANEL` 那一行。16×16 的 `2_感測器` 另外多一個煎荷包蛋（2026-11-24：巴特的每週作品 `babit-project\04_煎荷包蛋.txt` 原封不動；燈板平放當平底鍋，傾斜蛋會流、用力甩翻面；亮度 0.075＝接電腦和接充電器一樣亮，預覽另用 0.45；它不是循環的動畫，縮圖每 2.8 秒會跳一下）。
- 16×16 的範例都在程式裡用 `brightness()` 調暗（燈是 8×8 的四倍，預設 0.6 太刺眼）：彩虹、沙漏、頻譜 0.24，中文跑馬燈、小綠人 0.12（接充電器時燈條亮度約 38、19），生命遊戲 0.55（畫面大多是暗的）；接電腦時因為上面「程式自己調暗」的規則，還是 12，看得清楚；學員要亮一點就把 `BRIGHT` 調大。
- 小綠人是 17 格的逐格動畫（行人號誌的走路動畫，照巴特給的參考圖逐格描出來）：16×16 每排一個 16 位元的數；8×8 是把 16×16 每 2×2 格縮成一格、每格一個 0–4 的亮度數字。還沒按按鈕 1 時小綠人照旋鈕的速度走（平常 1.5 秒走兩步，旋鈕 0.5～1.5 倍）；按鈕 1 開始號誌循環：綠燈倒數 15 秒（不管旋鈕，從平常的速度越走越快、最後 2 倍；最後 8 秒一閃一閃，一開始慢、越接近 0 越快）→ 紅燈倒數 5 秒（正面的小紅人）→ 綠燈倒數 …，再按就從頭。按鈕 2 切換小綠人燈與倒數數字燈（七段數字，綠燈黃字、紅燈紅字；還沒按按鈕 1 時停在 15；數字放在畫面中間，十位的 1 只佔一欄）。兩片燈板一片小綠人燈、一片數字燈，同時按按鈕 1 就組成一座號誌（`START_DIGITS` 改 true＝開機就是數字燈）。這個範例的按鈕 2 不是換顏色。
- 生命遊戲（2026-11-12 加）：16×16 是巴特實機調好的版本，原封不動搬進來。8×8 是同一份程式只換參數：熱點 2–3 個、半徑 1.4–2.2 格、熱點密度 0.45（照搬 16×16 的參數會撒滿半個 8×8），冒點 2.5 秒，殘影 5 代（10 代在 8×8 上整面都是殘影）。旋鈕（演化速度）和按鈕 2（種長壽小圖形）只在演化時有作用，開場冒點的幾秒按了沒反應；test_examples.js 這時改在第 6 秒按。按鈕 2 也不是換顏色。
- 每個範例都用到旋鈕和兩顆按鈕，慣例是旋鈕調快慢或強弱、按鈕 1 換內容（方向、文字、樣式；番茄鐘是開始計時）、按鈕 2 換顏色；不做暫停，旋鈕轉到最左畫面也還在動（test_examples.js 會檢查）。用到旋鈕的速度要每格累加（`phase += speed * dt`），轉旋鈕時畫面才不會跳。

## 匯出 Arduino 資料夾／匯入 zip

- 用途：學員不用 Babit 工具，回家用 Arduino IDE 也能上傳自己的程式。工具頁範例區的「⬇ 匯出 Arduino 資料夾」把編輯區的程式打包成 zip；「⬆ 匯入 zip」把這種 zip 放回來變成「我的範例」。
- zip 照 Arduino 的草稿規格：`<名稱>/<名稱>.ino`（主檔一定要跟資料夾同名）、`BatoPixel.h`、`src/Adafruit_NeoPixel/`（燈條函式庫原始碼，學員不用另外裝函式庫）、`README.txt`（Arduino IDE 的設定與步驟）。不提供單獨的 `.ino` 下載：少了函式庫，Arduino IDE 編不過。
- 名稱只能用英數字（Arduino 的規定），所以自動編號 `babit_月日_序號`：序號記在瀏覽器的 localStorage（`babit.exportSeq`），同一天從 01 開始，成功才佔號。
- 作品名稱：匯出時工具頁把目前那張範例卡片的名稱一起送出（`?title=`），寫在 `README.txt` 第二行「作品名稱：…」。只在「編輯區的程式就是這張卡片」時才帶：自己的範例（改到一半也算）、或原封不動的官方範例；在官方範例上改過、或整段貼上別的程式就不帶。匯入時依序取 `README.txt` 的作品名稱 → 程式第一行的註解（`// 名稱`）→ 資料夾名稱（太長截到 40 字）→「匯入的作品」，每一個都先去掉前後空白、要能當範例名稱才採用。同名的已經有了就加編號（先截短再加，不會超過 40 字；截短不會把表情符號切成一半），不覆蓋。
- `BatoPixel.h` 為了這個功能多兩件事（只影響板子端，預覽不受影響）：
  - 草稿資料夾裡有 `src/Adafruit_NeoPixel/` 就用那一份（`__has_include`），沒有才用電腦上裝的。編譯站自己編的時候資料夾裡沒有 `src/`，照舊用安裝的函式庫。
  - 「工具」選單選錯用中文 `#error` 擋下，依序檢查：開發板要是 ESP32S3 Dev Module（別的 ESP32-S3 板子腳位對應、快閃記憶體設定可能不同，燒進去不一定開得了機）、不能是名稱幾乎一樣的「ESP32S3 Dev Module Octal (WROOM2)」（板子代號相同，用八線快閃記憶體的設定另外認；燈板的晶片是四線的，燒進去開不了機）、USB Mode 要是 Hardware CDC and JTAG、USB CDC On Boot 要是 Enabled（Arduino IDE 預設是關的）。後兩項關係到限流：板子靠晶片內建的 USB 序列埠判斷接的是電腦還是充電器，USB Mode 改成 USB-OTG 就判斷不出來（接電腦也用充電器的電流上限），CDC On Boot 關掉的組合沒有在實機驗證過。編譯站固定用 `esp32:esp32:esp32s3:CDCOnBoot=cdc`，不會碰到。擋不到的：DFRobot FireBeetle 2 ESP32-S3（板子代號也相同，從程式分不出來）。要拿別的板子來試：程式的 `#include "BatoPixel.h"` 前面寫 `#define BP_ANY_BOARD`，這些都不檢查。
- 燈條函式庫固定 Adafruit NeoPixel 1.15.5（跟學員安裝包同一版），授權 LGPL-3.0：`COPYING`（LGPL 條文，上游附的）和 `COPYING.GPL`（它所依據的 GPL-3.0 全文）都要跟著原始碼走。要升級：換掉 `firmware/arduino_export/src/Adafruit_NeoPixel/` 的檔案（兩份條文留著）、改 `README.txt` 裡的版本號，再跑 `node station/test_arduino_export.js`。
- 匯入只讀 zip 裡的 `.ino`（和 `README.txt` 的作品名稱），裡面附的函式庫不用（工具用自己那一份）。學員重新壓縮過的 zip 也收：檔案直接放在最上層、多了 macOS 的 `__MACOSX`、舊版 Windows 工具用反斜線分隔資料夾、用 tar 壓的檔名前面多了 `./`。
- 不收的 zip 都給中文原因：超過 2 MB（工具頁先擋，不送出）、謊報大小或內容損毀（`zip.js` 用實際解開的大小與檢查碼核對）、程式大到存不成範例（約 900 KB）、沒有 `#define PANEL`、作品有好幾個分頁（同一個資料夾裡還有別的 `.ino`／`.h`／`.cpp`：工具的範例是單一檔案，只收主檔的話分頁的程式會不見，所以請學員先併回主程式）。
- `README.txt`（給學員看的步驟）要先講解壓縮：Windows 可以直接點開 zip 裡的 `.ino`，那樣 Arduino IDE 旁邊沒有 `BatoPixel.h`，會編不過。
- 還沒在真的 Arduino IDE 上驗過（測試用的是 arduino-cli，也就是 IDE 裡面的編譯引擎）：Windows 使用者名稱是中文、Apple 晶片的 Mac 要不要 Rosetta，要實機試。

## 音高（audio.pitch()）

2026-11-25 為每週作品「音高闖關」加的：回傳麥克風現在聽到的音高（基頻，Hz），聽不出來是 0。頻譜（`audio.band()`）一段約半個八度，分不出差一個音。

- **做法**：McLeod Pitch Method。取最新 512 筆（16 kHz＝32 毫秒），自相關用 FFT 算（多兩次 1024 點的 FFT；一筆一筆乘要十幾萬次乘加，板子上約 5 毫秒，太慢），正規化後取「第一個」夠高（最高峰的 0.9 倍以上）的峰當週期，拋物線內插。峰的高度不到 `BP_PITCH_CLARITY`（0.6）就當成沒有音高。
- **什麼時候是 0**：沒有音源、音量在雜訊閘以下（跟 `audio.level()` 同一個門檻，`audio.sensitivity()` 也管得到）、雜音、拍手。
- **範圍**：約 70–2000 Hz（人聲、口哨、直笛）；2000–4000 Hz 量成低八度（音名一樣），再高不準。兩端的取樣率都是 16 kHz。
- **花費**：程式有呼叫才算、一格只算一次（`bp_audio_frame`），借用 FFT 的暫存陣列。沒用到的程式不受影響。板子上實際花多久還沒量。
- **沒做的**：不做平滑、不修八度（每一格回傳當下量到的值）。還沒用真的麥克風、真的人聲試過，只用合成的聲音驗證。

## 燈條（另一個接口接一條 WS2812 燈條）

2026-11-24 為聖誕花圈課加的：燈板以外再接一條燈條當氛圍燈。是特定檔期才用的東西，所以沒寫 `STRIP` 的程式完全不受影響。

- **寫法**：`#include` 前面寫 `#define STRIP 60`（幾顆，1–300）。之後用 `strip.dot(第幾顆, 顏色)`、`strip.fill(顏色)`、`strip.clear()`、`strip.fade(k)`、`strip.brightness(0–1)` 畫，`show()` 把燈板和燈條一起送出。`STRIP` 本身可以當數字用（`for (int i = 0; i < STRIP; i++)`）。說明在 AGENTS.md「接一條燈條」。
- **接口**：不另外設定，用 A、B 裡燈板沒用的那一個——燈板在 A（沒寫 `PORT`）燈條是 B、`#define PORT B` 時燈條是 A；第一、二版板子燈板接 C 時燈條在 A。`PORT` 的用法沒有變。
- **`strip` 這個名字只在寫了 `STRIP` 時才存在**：Adafruit 的範例都把燈條取名叫 `strip`，沒寫 `STRIP` 的舊程式自己開 `Adafruit_NeoPixel strip(…)` 照樣編得過。寫了 `STRIP` 又自己開 `Adafruit_NeoPixel`（取名 `strip`，或接在燈條的接口）會被編譯站用中文擋下（`sketch_prep.js`）。
- **亮度**：燈條有自己的 `strip.brightness()`（預設 0.6，跟燈板的 `brightness()` 分開），乘的電源亮度上限跟燈板同一組（接電腦 20、接充電器 160）。
- **限流**：燈條跟燈板共用整台的電流上限（接電腦 450 mA、接充電器 1500 mA）。燈條待機的電流算進底數、亮的部分加進估算，超過就燈板和燈條一起等比調暗。⚠️ 係數還沒實測（燈條還沒買）：先當成 5050 燈珠，每色全亮 13.5 mA（8×8 燈板的實測值）、待機每顆 1 mA；到貨後量全滅、全白各一次，改 `BP_STRIP_MA_PER_COLOR`、`BP_STRIP_MA_IDLE`。學員程式不能改這兩個數字。
- **板子端怎麼送**：燈條不經過 Adafruit_NeoPixel，函式庫自己開一個 RMT 通道送（`bp_line_begin`、`bp_line_show`）。Adafruit_NeoPixel 在 ESP32 上所有實體共用一個通道，換一支腳就把通道拆掉重建（它的 `esp.c`）；燈板、燈條每一格輪流送等於每秒拆建 120 次，被拆掉的那支腳在下一格之前沒人驅動，燈可能亂閃。燈條自己的通道開機建一次就留著，燈板照舊用 Adafruit_NeoPixel（只剩它一個，通道也就不會被拆）。時序跟 Adafruit 的一樣（10 MHz；0＝高 0.4／低 0.8 微秒，1＝高 0.8／低 0.4 微秒）；每顆送哪三個位元組（色序、亮度、限流的調暗）是兩端共用的 `bp_strip_bytes`，測試核對得到。需要 esp32 開發板套件 3.x。還沒在實機上看過。
- **色序**：預設 GRB；買到別種的在 `#include` 前面 `#define BP_STRIP_COLOR_ORDER NEO_RGB`（只認 RGB 三色的燈條）。
- **顆數上限 300**：每顆要送 30 微秒，300 顆 9 毫秒；16×16 燈板自己要 7.7 毫秒，兩個加起來一格（1/60 秒）快送不完，再長畫面更新率會掉。
- **預覽**：工具頁燈板預覽下面的「燈條預覽」收合鈕，預設收著，點開才畫一排燈（一直線；超過 80 顆平均折成幾排），開關狀態記在瀏覽器裡。程式有用燈條但收著時，鈕上寫「這份程式有 N 顆燈條」、外框變琥珀色。除錯模式不顯示。預覽模組匯出 `bp_strip_count`、`bp_strip_buffer`、`bp_strip_pin`、`bp_strip_brightness`（`preview/wrapper.cpp`）。
- **沒做的**：範例縮圖只畫燈板；零件檢查不測燈條；Art-Net 橋不送燈條；另一個接口接第二片燈板還是照 AGENTS.md「進階：多接一片燈板」自己開 `Adafruit_NeoPixel`（那個不在限流裡）。

## 硬體（固定在 BatoPixel.h）

**接線**：色序 GRB；8×8 逐行（第 0 顆在左上）；16×16 第 0 顆在右上、一欄一欄往下（2026-10-21 實測），函式庫送出前把內容逆時針轉 90°（`BP_ROTATE`）；麥克風 I²S 5／6／7、IMU I²C 11／12、旋鈕 GPIO1、按鈕 1–4＝GPIO8／9／44／4（按下接地、內部上拉）、蜂鳴器 GPIO10（經 100Ω 接 42Ω 的無源蜂鳴器 HC9042 到地），都是巴比特燈板 PCB 的固定接線；按鈕 3、4 與蜂鳴器是第三版 PCB（2026-11）加的，同一版拿掉了 C 接口（GPIO4 改接按鈕 4）與 PD 模組（電只從 SuperMini 的 USB-C 進）。學員只在程式裡選燈板（`#define PANEL 8／16`）與接口（`#define PORT A／B`＝GPIO2／3，沒寫＝A；第一、二版板子的 `PORT C`＝GPIO4 照樣編得過，那時函式庫不讀按鈕 4）。**電源**：板子用 USB 那一端有沒有電腦判斷電源——接電腦＝亮度上限 20；連續 2 秒沒有電腦＝接充電器或行動電源（第一、二版是 PD 模組），亮度上限 160；亮度預設 60%（學員程式可用 `brightness(k)` 改）乘上當下上限。每格估算電流（`bp_est_ma`），超過電流上限就整張等比調暗：係數照 2026-11-12 電流表實測，16×16 每色全亮 6.5 mA、全滅時整台（含 ESP32）130 mA，8×8 每色全亮 13.5 mA、全滅時整台 60 mA；上限是整台的電流，兩種燈板一樣：接電腦 450 mA、接充電器 1500 mA（16×16 全白放到 2.2 A 時燈板太燙）。亮的畫面估算偏高一到兩成，電流表讀到的會再低一點。接電腦時，程式自己調暗（比預設暗）就不再跟著壓那麼暗：最少是預設接電腦時的亮度 12，也不會比接 PD 時亮（`bp_led_bri`；預設與調亮的程式不受影響）。預覽不套亮度上限與限流，只照 `brightness()` 相對預設值調暗。**傾斜**：`tilt.x()`／`tilt.y()` 是畫面右／下方向的重力（g），沒有 IMU（預覽或沒接）時給左右搖擺的模擬值，`tilt.ready()` 表示真的有 IMU。**旋鈕與按鈕**：用途由學員程式決定，函式庫不會自己拿來做事。`knob.value()` 0–1（平滑、加死區、兩端貼齊 0 與 1）；`button1`～`button4` 的 `pressed()`（按著）與 `clicked()`（剛按下那一格），每格讀一次、連續兩格一樣才算數（去彈跳）；板子上 1、2 在上緣，3、4 在下緣。預覽用預覽畫面下方的滑桿與四顆按鈕（排成兩排，跟板子一樣）。**蜂鳴器**：`buzzer.beep(頻率, 秒)` 響一段時間自己停、`buzzer.tone(頻率)` 一直響到 `buzzer.off()`、`buzzer.playing()` 還在響嗎、`buzzer.ready()` 板子上有沒有偵測到蜂鳴器；頻率 40–20000 Hz（板子的 LEDC 用 40 MHz 石英、10 位元，39 Hz 以下設不出來，兩端都在 40 截住），音名用 `NOTE_C4`…（跟 Arduino 的 pitches.h 同一張表），這顆在 2000–3000 Hz 最大聲、1 kHz 以下很小聲。板子端用 LEDC 產生方波（不佔程式的時間），時間到由 `show()` 那一格關掉，所以長度以一格（1/60 秒）為單位、四捨五入到最近的一格（板子一格是 16 毫秒，判斷時提早半格，格數才跟預覽一樣）；`loop()` 卡住不再呼叫 `show()` 的話，響到一半的聲音不會自己停。不響的時候腳位是低電位或沒在輸出（線圈只有 42Ω，停在 HIGH 會一直流 23 mA）。`begin()` 時用內部上拉讀一次 GPIO10 判斷有沒有蜂鳴器（有的話會被拉到地），在 `begin()` 之前就叫它響的話偵測完會接著響；第一、二版的板子沒有蜂鳴器（那支腳是空的排針），`buzzer.ready()` 是 false，叫它響只是那支腳送出方波、沒有聲音（輸出不看偵測結果：自己在那支排針接一顆蜂鳴器就會響）。等蜂鳴器響完不能用迴圈（`while (buzzer.playing())` 會被預覽停下），要每一格用 `if (!buzzer.playing())` 接下一個音（AGENTS.md 有範例）。**Arduino 的 `tone()`／`noTone()` 不能用**，兩端都在編譯時用中文擋下（函式庫把這兩個名字改掉，單獨呼叫會落到一個只會報錯的樣板；`buzzer.tone()` 是成員，不受影響；編譯站的編譯前檢查也會先擋，訊息有行號）：板子上那是核心另一套做法（另一個工作、128 格的佇列、自己把腳位接上 LEDC），跟 `buzzer` 混用會停不下來或叫不響，每一格都呼叫會把佇列塞滿、動畫卡住，腳位寫成別支會把麥克風、燈板、按鈕的腳搶走，而這些預覽都看不出來。編譯前檢查另外擋兩種常見的 Arduino 蜂鳴器寫法（不然只有英文的編譯錯誤）：把變數取名叫 `buzzer`、`button1`～`button4`，以及 `#include "pitches.h"`。預覽用電腦的喇叭發聲（方波、音量很小），預覽畫面下方那一顆同時顯示頻率、也是靜音鍵（「🔔 聲音」／「🔕 靜音」，選擇記在瀏覽器裡；只管預覽，板子不受影響）；瀏覽器要使用者點過頁面才出聲，分頁收起來、新的程式編譯失敗、除錯模式接著板子時都不出聲。沒有擋的（預覽看不出來）：自己用 `pinMode()`／`digitalWrite()` 去推蜂鳴器的腳（停在 HIGH 會讓線圈一直通電）、自己開的 `Adafruit_NeoPixel` 接到第三版已經拿去當按鈕、蜂鳴器的腳（GPIO4、10、44）。**麥克風靈敏度**：`audio.sensitivity(k)`（0–1）照音樂節原型對數映射成倍率 1/16–16（0.5＝1），除在雜訊閘、滿版參考音量與節拍門檻上，沒設定是 1；FFT 範例讓旋鈕調（最左 0.15，不會整個關掉）。板子的雜訊閘 0.002、滿版參考音量 0.02；預覽維持雜訊閘 0.01、只用自動增益。**頻段**：`BANDS` 跟著燈板，8×8 是 8 段、16×16 是 16 段（頻譜一欄一段），60–7500 Hz 對數等分，跟電子音樂節裝置同一套切法；8 段邊界 60／110／200／366／669／1223／2236／4087／7500 Hz（16 段每段再對半），高頻補償 8 段每段 7 dB、16 段每段 3.5 dB。工具頁的頻段儀表條數跟著程式。**多開燈板**：學員可在程式裡自己開 `Adafruit_NeoPixel` 接另一個接口（例：`Adafruit_NeoPixel panelB(64, 3, NEO_GRB + NEO_KHZ800);`；接到主燈板那個接口會在編譯前擋下）；預覽端有同名空殼讓程式編得過，只畫主燈板；多開的燈板不在亮度上限與限流裡。

## 新燈板接線測試

1. 工具頁貼上 `firmware/panel_tests/walk.ino`（第一行改成燈板的尺寸）→ ⚡ 燒錄。藍點照實體燈號一顆一顆走，用 `arduino-cli monitor -p COM埠號 -c baudrate=115200` 看燈號。記下第 0 顆在哪個角、第二排是跳回同側（逐行）還是折返（蛇行）。
2. 依觀察改 `BatoPixel.h`「燈板接線」的 `BP_ROTATE`（第 0 顆不在左上：內容要逆時針轉幾度）／`BP_TRANSPOSE`／`BP_SERPENTINE`，並在 `station/test_compile.js` 的燈號檢查加上這塊燈板的左上、右上、左下。
3. 貼上 `firmware/panel_tests/corners.ino` 驗證：左上紅、右上綠、左下藍。

## 安全

編譯站只綁 127.0.0.1，但學員的瀏覽器同時也在逛別的網站，學員也會貼上、匯入不是自己寫的程式，所以有這幾條規矩（`station/test_security.js`、`station/test_sketch_prep.js`）：

- **編譯站不執行學員的程式**。編譯出來的預覽模組可以夾帶任意 JavaScript（`EM_ASM`、`EM_JS`、`emscripten_run_script`、手寫 `em_js` 區段都編得過），在 node 裡載入等於讓它在這台電腦上執行任意指令。所以沒有官方縮圖的範例，縮圖由工具頁算：編譯站只編譯，工具頁在沙箱裡跑一遍、取 28 格（取法跟 `station/thumb.js` 一樣），排成 PNG 顯示並 `PUT /thumb` 上傳。沙箱是 `sandbox="allow-scripts"` 的 iframe（沒有 `allow-same-origin`：碰不到工具頁，送出的請求 Origin 是 `null`、編譯站不收）裡再開一個 Worker（程式卡死 5 秒就整個停掉，不卡頁面）；沙箱傳回來的資料只當像素用，格式不對就丟掉。`load_module.js`（在 node 裡載入預覽模組）只給官方範例的縮圖產生（`examples/build_thumbs.js`）與測試用。
- **只收對著自己送來的請求**（`Host` 要是 `localhost`／`127.0.0.1`／`[::1]` 加自己的連接埠）：擋掉把別的網域名稱指到 127.0.0.1 的手法（DNS rebinding）。
- **會改東西或花力氣的請求只收工具頁自己送的**（GET、HEAD 以外的請求，`Origin` 有帶就要是自己，`Sec-Fetch-Site` 有帶就要是 `same-origin` 或 `none`）：別的網站可以不經同意就對 localhost 送 POST，瀏覽器只是不讓它讀回應。沒帶 `Origin` 的（測試程式、命令列工具）照收。
- 請求的網址要是「/路徑?參數」的原樣（絕對網址、帶 `..` 的路徑回 400）；一個請求出錯只回 500，不會讓編譯站整個停掉。
- **程式不能讀電腦上的檔案**（`sketch_prep.js` 的 `checkSketch`，編譯前就用中文擋下）。編譯器會照程式寫的路徑去讀檔：`#embed "路徑"` 把整個檔案讀進編出來的東西（實測讀得到編譯站那台電腦上任何檔案）、`#include` 一個不是程式的檔案會把內容帶進錯誤訊息、`__has_include` 可以探查檔案在不在、組合語言的 `.incbin` 也能讀檔、網路路徑還會讓電腦對外連線。規則：`#include` 只能寫標頭檔的名稱（`"…"` 或 `<…>`，不能用巨集代替，後面不能再寫別的東西），檔名用 `/` 分開的每一段只能是英數字、底線、點、加減號，不能用點開頭或結尾，也不能是 Windows 的裝置名稱——列「可以用的字」而不是「不能用的字」，因為空白、`$`、全形字這些各個作業系統有各的特殊解讀：`#include "CON "`（結尾一個空白）在 Windows 就是主控台，編譯器開了它會一直等輸入，韌體編譯卡到逾時（審查時實測）；指令的名稱不能用 `i` 這種寫法拼出來；`#embed`、`#include_next`、`#import` 不能用；`#pragma` 只收常見的幾種；整份程式不能出現 `asm`／`__asm__`／`__has_include`／`_Pragma` 這些字；`#define` 裡不能用 `##`（不然可以把上面那些字拼出來）。判斷的方式是「寧可多擋」：不去分辨一段字是不是在字串或註解裡（原始字串 `R"(…)"` 會騙過那種分辨），只認編譯器一定也這樣看的兩件事——行尾反斜線會把下一行接上來、指令的 `#` 前面只能有空白與 `/* */`。所以這些字就算寫在字串或行尾的註解裡也會被擋（整行都是 `//` 註解的不擋）。
  第二道保險在編譯之後：預覽編譯加 `-MD -MF` 讓編譯器列出它實際讀了哪些檔案（`#embed`、`#include` 讀的都會列出來），有編譯站以外的檔案就不把結果交給頁面（`deps_check.js`）。
- **檢查不能卡住編譯站**。編譯前的檢查在編譯站的主執行緒跑，以前有幾條正規表示式遇到特製的內容，時間跟長度的平方成正比：一份幾百 KB 的怪程式、或一個不到 1 KB 的 zip（第一行是幾十萬個空白）就能讓編譯站幾分鐘沒回應。現在程式上限 300 KB，那幾處改成一段一段看的寫法，測試用二十幾種「重複幾萬次」的內容確認都在 1.5 秒內做完（一行裡塞幾萬個「註解結尾＋指令」的在 0.3 秒內）。
- **編太久的程式準時停掉**。程式可以讓編譯器在「編譯的時候」做大量計算（`constexpr`、很深的樣板），不到 4 KB 就能讓一份預覽編二十幾秒到幾分鐘（審查時實測）。編譯有時間上限（離線版預覽 120 秒、韌體 180 秒；雲端版 20／90 秒），超過就連同編譯器開的子程序整串停掉（emcc 是 python 程式，真正在算的是它開的 clang；只停 emcc 的話 clang 會留在背景繼續算），回一段中文說明。雲端版每個人同時只編一份，所以一份慢的程式最多佔一個槽，別人照常編。
- **雲端版**（編譯站放在網路上，`gate.js`、`station/test_gate.js`、`station/test_cloud.js`）：Host 與 Origin 多收「對外的網址」（`BATOPIXEL_ORIGINS`）；GET、HEAD 以外的請求要帶課堂代碼（`X-Babit-Code`，比對時間不隨猜對幾個字而變），擋掉不是這堂課的人拿這台主機編譯——代碼用 8 個字以上、猜不到的，每次上課換；不存任何人的東西（存範例、上傳縮圖一律 403，主機的「我的範例」資料夾也不讀）；每個人排隊的份數有上限；設定不對（沒設代碼、網址寫錯）編譯站直接不啟動。容器那一層：不用 root 跑、不給任何額外權限、記憶體有上限、編譯站的容器連不到外面的網路（`cloud/compose.yaml`）。
- **工具頁不能被別的網站框進去**（`X-Frame-Options: DENY`、`frame-ancestors 'none'`、`Cross-Origin-Opener-Policy: same-origin`）：框它的網站可以把頁面裡的縮圖沙箱換成自己的頁面，攔走送進沙箱的東西、回傳假縮圖。

還沒做的：預覽在工具頁裡執行時，程式夾帶的 JavaScript 仍然會以工具頁的身分執行（可以叫編譯站增刪「我的範例」、用已經授權的序列埠；雲端版還讀得到存在瀏覽器裡的範例與課堂代碼），只是碰不到電腦上的檔案。要擋掉得在編譯後檢查 wasm 的匯入表（官方範例只有 `emscripten_asm_const_int` 一項），見 vault 的 PRD 待做事項。

## 已知坑

- **.ps1 必須存 UTF-8 with BOM**：PowerShell 5.1 在繁中 Windows 把無 BOM 的 .ps1 當 ANSI 讀，中文註解位元組錯拆會產生假引號、打亂指令參數（實際症狀：upload 報 `accepts at most 1 arg(s), received 2`，錯誤訊息完全不指向編碼）。細節見 vault `規格文件_點陣動畫開發工具.md`「開發紀錄：踩過的坑」。
- USB-C 線要能傳資料，充電專用線看不到 COM 埠。
- **燒完要工具頁自己送重開訊號**：這版 esptool-js 的 hard reset 只放開 RTS、沒有先拉起來，不會重開。Windows 關閉序列埠時剛好會讓板子重開，Mac 不會，燒完停在燒錄模式、要按 RESET 才跑（2026-10-31 課堂上學員回報）。工具頁燒完、關閉序列埠前送 DTR=0、RTS 拉起 100 毫秒再放開（`resetBoard`）。
- 安裝路徑要是英文：中文路徑會讓板子端編譯失敗。
- 燈序：官方 NeoMatrix 宣告 TOP＋RIGHT＋COLUMNS＋PROGRESSIVE；本函式庫用 `BP_ROTATE`／`BP_TRANSPOSE`／`BP_SERPENTINE` 旗標對應，以三角定位（corners.ino）為準。
