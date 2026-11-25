#!/bin/sh
# 雲端版映像的啟動指令：用 emsdk 裡的 node 跑編譯站（跟學員電腦一樣，不另外裝 Node.js）
set -e
NODE="$(ls -d /opt/babit/tools/emsdk/node/*/bin/node | head -n 1)"
[ -x "$NODE" ] || { echo "找不到 emsdk 的 node" >&2; exit 1; }
exec "$NODE" /opt/babit/station/server.js
