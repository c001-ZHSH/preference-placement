#!/bin/bash
# ── VocabMaster 快速啟動 ──────────────────────────────────────
# 雙擊此檔案即可啟動（備用方案）

# 取得此檔案所在目錄
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=7654
PIDFILE="/tmp/vocabmaster_server.pid"

# 停止舊的 server
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null)
  [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null
  rm -f "$PIDFILE"
fi
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
sleep 0.3

# 啟動 server
cd "$DIR"
python3 -m http.server "$PORT" > /tmp/vocabmaster.log 2>&1 &
echo $! > "$PIDFILE"

# 等待啟動後開啟瀏覽器
sleep 0.5
open "http://localhost:$PORT"

echo ""
echo "✅ VocabMaster 已啟動！"
echo "   網址：http://localhost:$PORT"
echo ""
echo "關閉此視窗即停止 server。"
echo ""

# 等待 server 結束（關閉 Terminal 視窗時停止）
wait
