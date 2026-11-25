#!/usr/bin/env bash
# 雲端版：在雲端主機上建映像並啟動（部署目標：雲端版）。
# 在「cloud/build.sh --pack 打包出來、解開後的資料夾」裡執行：
#   cp cloud/env.example cloud/.env     第一次：填對外的網址、課堂代碼、Cloudflare 通道的金鑰（BABIT_VERSION 不用填，這支腳本會填）
#   bash cloud/up.sh                    建映像（第一次約 15 分鐘，要下載工具鏈）→ 啟動 → 印出狀態
# 之後：cd cloud && docker compose logs -f station（看每一份編譯）、docker compose down（關掉）
set -euo pipefail
cd "$(dirname "$0")/.."

ver=$(sed -n 's/.*"source":"\([0-9a-f]\{7,\}\)".*/\1/p' version.json 2>/dev/null || true)
[ -n "$ver" ] || { echo "找不到版本檔 version.json：這個資料夾要是 cloud/build.sh --pack 打包出來的（不能直接拿 repo 來用）" >&2; exit 1; }
[ -f cloud/.env ] || { echo "還沒有設定檔：先執行 cp cloud/env.example cloud/.env，再用 nano cloud/.env 填好" >&2; exit 1; }
for key in BABIT_URL BABIT_CLASS_CODE CLOUDFLARE_TUNNEL_TOKEN; do
  grep -Eq "^$key=.+" cloud/.env || { echo "cloud/.env 的 $key 還沒填" >&2; exit 1; }
done

echo "── 建映像 babit-cloud:$ver（雲端版 · $ver）"
docker build -f cloud/Dockerfile -t "babit-cloud:$ver" .

# 設定檔裡的映像版本跟著這個資料夾的版本走（之後 docker compose 的指令都讀這個檔）
if grep -q '^BABIT_VERSION=' cloud/.env; then sed -i "s/^BABIT_VERSION=.*/BABIT_VERSION=$ver/" cloud/.env; else echo "BABIT_VERSION=$ver" >> cloud/.env; fi

echo "── 啟動"
cd cloud
docker compose up -d
sleep 5
docker compose ps
url=$(sed -n 's/^BABIT_URL=//p' .env)
echo
echo "啟動了：雲端版 · $ver"
echo "用自己的電腦開 $url ，標題旁邊要看到「雲端版 · $ver」，再照操作手冊做開課前檢查。"
