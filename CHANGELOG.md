# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

### Added
- 新增 `CHANGELOG.md`，用于记录项目版本变更历史。
- 新增地契 OCR 实时扫描入口，支持摄像头取景、地契边缘检测、稳定锁定后自动拍摄，并对识别画面做透视校正。
- 新增 Windows 一键启动脚本 `start.bat`，自动检查 Node/npm、安装依赖、构建前端并启动服务。
- 新增 `server/db.js`，用 Node.js 内置 SQLite 封装数据库连接、事务和 PRAGMA 调用。

### Changed
- 在 `README.md` 增加“变更日志”小节，并添加到 `CHANGELOG.md` 的超链接入口。
- 服务端数据库依赖从 `better-sqlite3` 切换为 Node.js 内置 `node:sqlite`，降低 Windows 原生模块构建成本。
- 服务端运行环境要求调整为 Node.js `>=22.13.0`，并在启动脚本中增加版本检查。
- 调整 `main.sh` 的前后端依赖安装和前端构建方式，在对应目录内执行 npm 命令。
- 将 `server/package-lock.json` 纳入版本管理，锁定服务端依赖解析结果。

### Removed
- 移除仓库根目录 `package.json`，启动、构建和迁移入口改由专用脚本及服务端/前端各自的 npm 配置承担。

## [1.0.0] - 2026-04-18

### Added
- 初始化大富翁银行项目，完成前后端基础架构和核心功能。
- 实现游戏暂停/恢复、AI 地契识别和利息管理能力。

[Unreleased]: https://github.com/bc1pjerry/ai-monopoly-bank/compare/04b8bdf...HEAD
[1.0.0]: https://github.com/bc1pjerry/ai-monopoly-bank/tree/04b8bdf
