#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$PROJECT_DIR/server.log"
PID_FILE="$PROJECT_DIR/server.pid"
SERVER_DIR="$PROJECT_DIR/server"
CLIENT_DIR="$PROJECT_DIR/client"
CERT_DIR="$PROJECT_DIR/certs"
PORT=8765

usage() {
  echo "用法: $0 {start|stop|restart}"
  exit 1
}

cmd_start() {
  # ─── 加载 shell 环境（确保 nvm/fnm/homebrew 等 PATH 正确）────────────
  for f in "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile"; do
    if [ -f "$f" ]; then
      source "$f" 2>/dev/null || true
      break
    fi
  done

  # 确保 homebrew 在 PATH 中（macOS arm64）
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" || true
  fi

  set -e

  echo "Node: $(node -v) ($(which node))"

  NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
  NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
  if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
    echo "Node.js v22.13.0 or newer is required because the server uses built-in SQLite."
    return 1
  fi

  # ─── 检查是否已在运行 ────────────────────────────────────────────────
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "服务已在运行 (PID: $OLD_PID)"
      return 0
    else
      rm -f "$PID_FILE"
    fi
  fi

  # ─── 安装服务端依赖 ──────────────────────────────────────────────────
  if [ ! -d "$SERVER_DIR/node_modules" ]; then
    echo "正在安装服务端依赖..."
    (cd "$SERVER_DIR" && npm install)
  fi

  # ─── 安装前端依赖并构建 ──────────────────────────────────────────────
  if [ ! -d "$CLIENT_DIR/node_modules" ]; then
    echo "正在安装前端依赖..."
    (cd "$CLIENT_DIR" && npm install)
  fi

  echo "正在构建前端..."
  (cd "$CLIENT_DIR" && npm run build)

  # ─── 生成自签名 HTTPS 证书（如果不存在）───────────────────────────────
  if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
    echo "正在生成自签名 HTTPS 证书..."
    mkdir -p "$CERT_DIR"
    LOCAL_IP=$(node -e "
      const os = require('os');
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) { console.log(net.address); process.exit(); }
        }
      }
      console.log('127.0.0.1');
    ")
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$CERT_DIR/key.pem" \
      -out "$CERT_DIR/cert.pem" \
      -days 365 \
      -subj "/CN=monopoly-bank" \
      -addext "subjectAltName=IP:127.0.0.1,IP:${LOCAL_IP}" \
      2>/dev/null
    echo "证书已生成: $CERT_DIR/ (IP: $LOCAL_IP)"
  fi

  # ─── 启动服务 ────────────────────────────────────────────────────────
  echo "正在启动服务..."
  nohup node "$SERVER_DIR/server.js" > "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"

  # 等待 2 秒检查进程是否存活
  sleep 2
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "启动成功 (PID: $SERVER_PID)"
    echo "访问地址: https://127.0.0.1:$PORT"
  else
    echo "启动失败！查看日志："
    cat "$LOG_FILE"
    rm -f "$PID_FILE"
    return 1
  fi
}

cmd_stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "服务未在运行 (PID 文件不存在)"
    return 0
  fi

  PID=$(cat "$PID_FILE")

  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm -f "$PID_FILE"
    echo "已终止 (PID: $PID)"
  else
    echo "进程 $PID 已不存在，清理 PID 文件"
    rm -f "$PID_FILE"
  fi
}

cmd_restart() {
  cmd_stop
  cmd_start
}

case "${1:-}" in
  start) cmd_start ;;
  stop)  cmd_stop  ;;
  restart) cmd_restart ;;
  *)     usage     ;;
esac
