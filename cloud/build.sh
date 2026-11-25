#!/usr/bin/env bash
# 雲端版：把某一個 commit 做成「可以拿去部署的東西」（部署目標：雲端版）。
# 只收已經 commit 的內容：從 git 取出指定的 commit（預設 HEAD），加上版本檔 version.json（target=cloud、來源 commit、日期）。
# 工作目錄裡還沒 commit 的修改不會進去——工具頁角落顯示的「雲端版 · commit」就一定對得上 git 裡的那一版。
#
# 用法（在 repo 裡任一個資料夾；Windows 用 Git Bash）：
#   bash cloud/build.sh                  用 HEAD 在這台電腦建映像 babit-cloud:<commit 前 7 碼>（要有 Docker）
#   bash cloud/build.sh <commit>         用指定的 commit 建
#   bash cloud/build.sh --pack [commit]  不建映像，只打包成 babit-cloud-<commit 前 7 碼>.tar.gz（放在目前的資料夾），
#                                        傳到雲端主機上解開再建（步驟見 vault 的「Babit雲端版GCP操作手冊」）
set -euo pipefail

pack=0
if [ "${1:-}" = "--pack" ]; then pack=1; shift; fi
here="$(pwd)"
cd "$(dirname "$0")/.."
src=$(git rev-parse --verify "${1:-HEAD}^{commit}")
short=${src:0:7}
name="babit-cloud-$short"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/$name"
git archive "$src" | tar -x -C "$tmp/$name"
[ -f "$tmp/$name/cloud/Dockerfile" ] || { echo "這個 commit（$short）還沒有 cloud/Dockerfile，不能做成雲端版" >&2; exit 1; }
printf '{"target":"cloud","source":"%s","date":"%s"}\n' "$short" "$(date +%Y-%m-%d)" > "$tmp/$name/version.json"

if [ $pack = 1 ]; then
  tar -czf "$here/$name.tar.gz" -C "$tmp" "$name"
  echo "打包好了：$here/$name.tar.gz（雲端版 · $short）"
  exit 0
fi
docker build -f "$tmp/$name/cloud/Dockerfile" -t "babit-cloud:$short" "$tmp/$name"
echo "建好了：babit-cloud:$short（雲端版 · $short）"
