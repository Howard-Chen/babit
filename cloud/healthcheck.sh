#!/bin/sh
# 容器的健康檢查（compose.yaml）：編譯站有沒有在回應。映像裡沒有 curl，用 emsdk 的 node 問 /version
NODE="$(ls -d /opt/babit/tools/emsdk/node/*/bin/node | head -n 1)"
exec "$NODE" -e 'fetch("http://127.0.0.1:" + (process.env.BATOPIXEL_PORT || 8930) + "/version").then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))'
