# syntax=docker/dockerfile:1
# Babit 雲端版的編譯站映像（部署目標：雲端版）。不要直接 docker build，用腳本建：
#   bash cloud/build.sh [commit]        從指定的 commit（預設 HEAD）取出內容、寫入版本檔，建成 babit-cloud:<commit 前 7 碼>
# 啟動用 cloud/compose.yaml（編譯站＋對外的 Cloudflare Tunnel）。
# 工具鏈版本照學員安裝包（install.ps1／install.sh）；資料夾配置也照學員電腦的安裝資料夾（/opt/babit/tools/…），
# 編譯站用同一套找工具的規則（station/toolpaths.js），不用另外設定。

# ── 第一段：下載並安裝工具鏈（約 2.5 GB 下載，這幾層建過一次就留在快取裡，改編譯站的程式不會重來）──
FROM debian:bookworm-slim AS toolchain
ARG EMSDK_VERSION=6.0.8
ARG ARDUINO_CLI_VERSION=1.5.1
ARG ESP32_CORE_VERSION=3.3.11
ARG NEOPIXEL_VERSION=1.15.5
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git python3 xz-utils bzip2 unzip \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/babit/tools

# emsdk（網頁預覽的編譯器）。Linux 的 emsdk 不帶 python：toolpaths.js 找的是 emsdk/python/<版本>/bin/python3，放一個指到系統 python3 的連結
RUN git clone --depth 1 --branch ${EMSDK_VERSION} https://github.com/emscripten-core/emsdk.git emsdk \
 && cd emsdk \
 && ./emsdk install ${EMSDK_VERSION} \
 && ./emsdk activate ${EMSDK_VERSION} \
 && rm -rf .git downloads zips \
 && mkdir -p python/system/bin \
 && ln -s /usr/bin/python3 python/system/bin/python3

# arduino-cli、ESP32 核心、燈條函式庫
RUN mkdir arduino-cli \
 && curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" | tar -xz -C arduino-cli arduino-cli
COPY cloud/arduino-cli.yaml arduino-cli.yaml
RUN ./arduino-cli/arduino-cli --config-file arduino-cli.yaml core update-index \
 && ./arduino-cli/arduino-cli --config-file arduino-cli.yaml core install "esp32:esp32@${ESP32_CORE_VERSION}" \
 && ./arduino-cli/arduino-cli --config-file arduino-cli.yaml lib update-index \
 && ./arduino-cli/arduino-cli --config-file arduino-cli.yaml lib install "Adafruit NeoPixel@${NEOPIXEL_VERSION}" \
 && rm -rf arduino/staging
# 只留 ESP32-S3 用得到的：其他晶片的函式庫、RISC-V 工具鏈、除錯工具合計 4 GB 以上，編 S3 用不到（拿掉後實測照樣編得過）
RUN cd arduino/data/packages/esp32/tools \
 && find . -maxdepth 1 -name 'esp32*-libs' ! -name 'esp32s3-libs' -exec rm -rf {} + \
 && rm -rf esp-rv32 xtensa-esp-elf-gdb riscv32-esp-elf-gdb openocd-esp32 \
 && du -sh /opt/babit/tools/*

# ── 第二段：編譯站 ──
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 1000 babit
WORKDIR /opt/babit
COPY --from=toolchain --chown=babit:babit /opt/babit/tools tools
COPY --chown=babit:babit AGENTS.md ./
COPY --chown=babit:babit firmware firmware
COPY --chown=babit:babit preview preview
COPY --chown=babit:babit examples examples
COPY --chown=babit:babit station station
COPY --chown=babit:babit cloud/entrypoint.sh cloud/healthcheck.sh cloud/warmup.js cloud/
# 版本檔（target=cloud、來源 commit、日期）：編譯站靠它知道自己是雲端版、是哪一版，工具頁標題旁邊會顯示。
# repo 裡沒有這個檔——是 cloud/build.sh 從指定的 commit 取出內容時寫的；直接在工作目錄 docker build 會停在這一行，
# 這是故意的：雲端版只部署「已經 commit、說得出是哪一版」的內容
COPY --chown=babit:babit version.json ./
RUN chown babit:babit /opt/babit && chmod +x cloud/entrypoint.sh cloud/healthcheck.sh
# 編譯站不用 root 跑
USER babit
ENV BATOPIXEL_PORT=8930
# 先把預覽與每個韌體槽都編過一次，ESP32 核心與各槽的建置結果留在映像裡：主機開起來後學員第一次燒錄不用多等。
# BABIT_WARM_SLOTS＝先暖幾個槽（上課時 BATOPIXEL_FW_SLOTS 不超過這個數）
ARG BABIT_WARM_SLOTS=6
RUN BABIT_WARM_SLOTS=${BABIT_WARM_SLOTS} "$(ls -d tools/emsdk/node/*/bin/node | head -n 1)" cloud/warmup.js
EXPOSE 8930
ENTRYPOINT ["/opt/babit/cloud/entrypoint.sh"]
