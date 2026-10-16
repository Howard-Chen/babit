# BatoPixel 安裝指南（新的 Windows 機器）

從零把編譯站架起來。全程約 20 分鐘，主要時間花在下載。

## 0. 取得專案

```powershell
git clone <repo-url> D:\CSH\CODE\batopixel
```

路徑不必是 `D:\CSH\CODE`，程式碼不依賴專案自身位置。

## 1. arduino-cli（編板子用的編譯器）

```powershell
winget install --id ArduinoSA.CLI -e
```

裝完**開一個新的 PowerShell 視窗**（PATH 才會生效），然後裝 ESP32 開發板套件：

```powershell
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
arduino-cli lib install "Adafruit NeoPixel"
```

`core install` 約 2GB、需要數分鐘——它一次裝齊 ESP32 全家族的工具鏈（Xtensa 與 RISC-V）。

## 2. Python（emsdk 的相依）

```powershell
winget install --id Python.Python.3.12 -e
```

> **必須裝真的 Python。** Windows 內建的 `WindowsApps\python.exe` 是 Microsoft Store 的替身程式，執行後靜默結束（exit 49）且不報錯，會讓 emsdk 安裝失敗且看不出原因。

## 3. Emscripten（編瀏覽器預覽用的編譯器）

```powershell
git clone https://github.com/emscripten-core/emsdk.git D:\CSH\CODE\emsdk
```

用**真 Python 的絕對路徑**執行安裝（不要用 `emsdk.bat`，它會呼叫到上面那個假替身）：

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" D:\CSH\CODE\emsdk\emsdk.py install latest
```

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" D:\CSH\CODE\emsdk\emsdk.py activate latest
```

下載約 1.5GB。emsdk 會自帶一份 python 與 node，編譯站會自動找到它們。

## 4. Node.js（跑編譯站；可跳過）

若系統沒有 Node，編譯站會自動改用 emsdk 內建的那份，所以這步是選配。要獨立安裝：

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

## 5. 啟動

最快的方式：執行專案根目錄的 `BatoPixel.bat`（會起編譯站、自動開瀏覽器；ping 得到 Art-Net 燈板時一併啟動橋）。要桌面捷徑就對它按右鍵「傳送到 → 桌面（建立捷徑）」，圖示可指到 `icon.ico`。
**`.bat` 本身不要搬到桌面**，它靠自己的位置找 `station\run_station.ps1`。

以下是手動啟動的方式：

```powershell
powershell -ExecutionPolicy Bypass -File D:\CSH\CODE\batopixel\station\run_station.ps1
```

看到 `BatoPixel 編譯站 → http://localhost:8930` 就成功了。用 Chrome 或 Edge 開該網址（Web Serial 只支援這兩者）。

驗收：貼上預設的彩虹範例按「▶ 執行」，預覽動起來即代表 emcc 通；插上板子按「⚡ 燒錄」，板子跑出動畫即代表 arduino-cli 與 esptool-js 都通。

## 路徑不同時：環境變數覆寫

編譯站會自動搜尋常見安裝位置，找不到時會列出試過哪些路徑。要指定的話：

| 變數 | 用途 | 範例 |
| ---- | ---- | ---- |
| `BATOPIXEL_EMSDK` | emsdk 根目錄 | `C:\emsdk` |
| `BATOPIXEL_ARDUINO_CLI` | arduino-cli 執行檔 | `C:\tools\arduino-cli.exe` |
| `BATOPIXEL_NODE` | node 執行檔 | `C:\Program Files\nodejs\node.exe` |
| `BATOPIXEL_FQBN` | 目標開發板 | `esp32:esp32:esp32c3` |

emsdk 內部的 python 與 node 目錄帶版本號（各機器不同），編譯站會自動偵測，不需設定。

## 已知坑

| 症狀 | 原因與處理 |
| ---- | ---- |
| emsdk 安裝靜默失敗、exit 49 | 用到 Microsoft Store 的假 python → 改用真 Python 的絕對路徑 |
| `emcc` 找不到／`emsdk_env.bat` 沒作用 | 系統 PATH 逼近 cmd 的 2047 字元上限，append 被靜默吃掉 → 編譯站不依賴它，一律絕對路徑呼叫 |
| 自訂 `.ps1` 腳本出現詭異解析錯誤 | 繁中 Windows 下 PS 5.1 把無 BOM 的 .ps1 當 ANSI 讀 → 存成 **UTF-8 with BOM**，或註解只用 ASCII |
| 燒錄鈕沒反應 | 用了 Chrome/Edge 以外的瀏覽器，或網址非 HTTPS/localhost（Web Serial 限安全來源） |
| 板子看不到 COM 埠 | USB-C 線是充電專用線，換成能傳資料的 |
| 燒錄握手失敗 | 手動進 bootloader：按住 BOOT → 點 RESET → 放開 BOOT，再燒一次 |

## 選配：獨立預覽工具

`preview/` 是不啟動編譯站也能驗證 WASM 的除錯工具，**產物不進版控**，clone 後需自行建置一次：

```powershell
powershell -ExecutionPolicy Bypass -File D:\CSH\CODE\batopixel\preview\build_wasm.ps1
```

建好後 `preview/index.html` 可雙擊開啟，`preview/test_node.js` 可做像素數值比對。日常開發不需要這步——編譯站會即時編譯。

## 選配：Art-Net 燈板橋（展示用）

把預覽即時送到區網內的 Art-Net 控制器（16×16 燈板）。**只需 Node，不需要 emsdk 或 arduino-cli**——想在別台機器上只跑燈板時，第 1～3 步可全部跳過：

```powershell
powershell -ExecutionPolicy Bypass -File D:\CSH\CODE\batopixel\bridge\run_bridge.ps1
```

控制器 IP 與燈序在 `bridge\config.json`。頁面偵測不到橋時會靜默停用，不影響其他功能。

背景與設計見 Obsidian vault 的 `規格文件_點陣動畫開發工具.md`。
