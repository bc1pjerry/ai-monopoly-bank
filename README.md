# 大富翁银行

多人局域网大富翁银行，支持创建房间、扫码进入、庄家操作、玩家互转、改名等功能。

## 变更日志

- [查看 CHANGELOG](./CHANGELOG.md)

## 功能

- 创建房间，设置玩家数量和起始金额
- 生成各人专属链接 / 二维码，扫码进入
- 庄家：发钱、扣钱、批量改名、重置房间
- 玩家：向其他玩家转账、缴罚款给银行、自己改名
- 交易流水实时同步
- 数据持久化到 SQLite3（`data/monopoly.db`），服务重启后自动恢复

## 项目结构

```
monopoly-bank/
├── server/          # Node.js 服务端
│   ├── server.js    #   HTTP 服务 + SQLite3 数据库
│   ├── migrate.js   #   rooms.json → SQLite3 一次性迁移脚本
│   └── package.json #   服务端依赖 (better-sqlite3)
├── client/          # Vue 3 前端
│   ├── src/
│   ├── vite.config.js
│   └── package.json
├── dist/            # 前端构建产物（由 vite build 生成）
├── data/            # 持久化数据
│   └── monopoly.db  #   SQLite3 数据库
├── start.sh         # 一键启动（构建前端 + 启动服务）
├── stop.sh          # 停止服务
└── package.json     # 根项目脚本
```

## 技术栈

- 前端：Vue 3 + Vite
- 后端：Node.js 原生 HTTP 服务 + better-sqlite3
- 数据库：SQLite3

## 开发

```bash
# 启动后端
node server/server.js

# 另开终端，启动前端开发服务（含热更新，API 自动代理到 :8765）
cd client
npm install
npm run dev
```

前端开发地址：`http://localhost:5173`

## 生产部署

```bash
./start.sh   # 自动构建前端，然后启动 node 服务
./stop.sh    # 停止服务
```

访问地址：`http://127.0.0.1:8765`（或局域网 IP 同端口）
