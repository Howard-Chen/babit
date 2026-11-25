Babit 燈板程式（Arduino 資料夾）：{NAME}
作品名稱：{TITLE}

解壓縮之後，這個資料夾可以直接用 Arduino IDE 打開，上傳到 Babit 燈板，不需要 Babit 工具。

資料夾裡有：
  {NAME}.ino                你的程式
  BatoPixel.h               Babit 的函式庫（不要刪、不要改名）
  src/Adafruit_NeoPixel/    燈條的函式庫（Adafruit NeoPixel 1.15.5，授權是 LGPL-3.0：
                            條文在裡面的 COPYING，它所依據的 GPL-3.0 條文在 COPYING.GPL）

── 第一次使用（只要做一次）──
1. 安裝 Arduino IDE 2：https://www.arduino.cc/en/software
2. 打開 Arduino IDE，點左邊的「開發板管理員」（Boards Manager），搜尋 esp32，
   安裝「esp32 by Espressif Systems」。要下載約 2 GB，下載的檔案會留在電腦裡，
   裝好後總共佔硬碟約 8 GB：請先空出 10 GB 以上；網路慢的話要等十幾分鐘以上。

── 每次上傳 ──
1. 先把 zip 解壓縮：Windows 在 zip 檔上按右鍵 →「解壓縮全部」；Mac 點兩下 zip 就會解開。
   不要在 zip 裡面直接點開 .ino，那樣 Arduino IDE 會找不到 BatoPixel.h。
2. 用 Arduino IDE 打開解壓縮出來的資料夾裡的 {NAME}.ino
   （資料夾和 .ino 的名稱要一樣，要改名就兩個一起改，只能用英文、數字、底線）
3. 工具（Tools）→ 開發板（Board）→ esp32 → 選「ESP32S3 Dev Module」
   （清單裡還有一個名稱很像、後面多了 Octal 的，不要選那個）
4. 工具（Tools）→ USB CDC On Boot → 選「Enabled」
   （同一個選單的 USB Mode 保持「Hardware CDC and JTAG」，不用改）
5. 用 USB 線把燈板接上電腦，工具（Tools）→ 連接埠（Port）→ 選燈板的那一個
6. 按左上角的「→」（上傳）。第一次編譯要幾分鐘，之後會快很多。

── 上傳不了的時候 ──
- 出現「BatoPixel.h: No such file or directory」：沒有先解壓縮，照上面「每次上傳」的第 1 步重來。
- 出現中文的錯誤訊息（例如「請在 Arduino IDE 的…」）：照它說的改「工具」選單裡的設定。
- 一直連不上：按住板子上的 BOOT 鍵不放，按一下 RESET 鍵，再放開 BOOT；
  重新選一次連接埠，再按上傳。
- 電腦找不到板子：換一條可以傳資料的 USB 線（只能充電的線不行）。

── 放回 Babit 工具 ──
在 Babit 工具頁按「匯入 zip」，選當初匯出的 zip。在 Arduino IDE 改過程式的話，
把這個資料夾重新壓縮成 zip 再匯入。匯入後會變成「我的範例」。
