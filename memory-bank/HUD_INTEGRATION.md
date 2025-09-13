# VDT Debug HUD 集成完成

## 概述

成功将基于 Next.js 的 Browser + Terminal UI 集成到 VDT MCP 中作为 Debug HUD，支持两种启动方式：
1. 通过 `npx vdt-mcp --hud` 直接启动 HUD 界面
2. 在 `capture_run` 时自动启动并显示开发服务器内容

## 主要功能

### 1. 灵活的启动方式
- **CLI 直接启动**: `npx vdt-mcp --hud` 或 `npx vdt-mcp --with-hud` 
- **自动启动**: 当使用 `capture_run` 工具且 `mode="web"` 时，自动启动 Debug HUD
- **端口配置**: 支持 `--hud-port=3900` 指定 HUD 端口
- HUD 在独立端口（默认3900+）运行，避免与开发服务器冲突
- 支持 `openHud` 参数控制是否启动（默认为 true）

### 2. 自动依赖管理
- postinstall 脚本自动安装 HUD 依赖包
- 无需手动执行 `cd src/hud && pnpm install`
- 支持 pnpm workspace 管理

### 3. 三面板界面
- **Browser Panel**: 自动加载指定的开发服务器 URL（如 http://localhost:8080）
- **Terminal Panel**: 显示命令执行输出和日志
- **Logs Panel**: 实时显示结构化日志事件

### 4. 实时数据流
- WebSocket 连接实现实时日志传输
- 捕获用户交互（点击、输入、导航）
- 捕获控制台输出（log、warn、error）
- 捕获网络请求（可选）

### 5. 控制功能
- 开始/停止录制
- 导出日志文件
- 回放操作脚本
- 实时状态显示

## 使用方法

### 方式一：CLI 直接启动 HUD

```bash
# 启动 HUD 和 MCP 服务器
npx vdt-mcp --hud

# 或者使用长选项
npx vdt-mcp --with-hud

# 指定 HUD 端口
npx vdt-mcp --hud --hud-port=4000
```

启动后：
1. MCP 服务器在 stdio 模式运行
2. HUD 界面自动在 http://localhost:3900 启动（或指定端口）
3. 可以直接在浏览器中访问调试界面
4. 默认显示 http://localhost:3000 的开发服务器

### 方式二：通过 capture_run 自动启动

```json
{
  "tool": "capture_run",
  "args": {
    "sid": "debug-session-1",
    "mode": "web",
    "web": {
      "entryUrl": "http://localhost:8080",
      "actions": true,
      "console": true,
      "network": true
    }
  }
}
```

自动启动流程：
1. 调用 `capture_run` 
2. VDT 启动 HUD 服务器（通常在 http://localhost:3900）
3. Browser 面板自动加载 `entryUrl` 指定的开发服务器
4. 开始实时捕获所有交互和日志
5. 用户可以在 HUD 中正常使用应用，所有操作都被记录

### 3. 实时监控
- **Browser**: 显示应用实际运行界面
- **Terminal**: 显示服务器日志和命令输出  
- **Logs**: 显示格式化的事件日志
- **Controls**: 控制录制、导出、回放等操作

## 技术实现

### 架构组件
- **HudManager**: 管理 HUD 生命周期和 WebSocket 通信
  - `startHud()`: 在 capture_run 时启动，关联具体会话
  - `startStandaloneHud()`: CLI 直接启动的独立模式
- **CLI Integration**: 增强的命令行入口点 (`bin.ts`)
  - 支持 `--hud` / `--with-hud` 启动选项
  - 支持 `--hud-port=N` 端口配置
- **Auto Dependencies**: 自动依赖管理 (`postinstall` 脚本)
  - 检测 HUD 目录存在时自动执行 `pnpm install`
- **Next.js HUD App**: 基于 React 的调试界面
- **WebSocket Server**: 处理实时数据传输

### 数据流
```
开发服务器 (localhost:8080)
    ↓ 代理加载
HUD Browser Panel
    ↓ 事件捕获
WebSocket 
    ↓ 广播
Terminal & Logs Panels
    ↓ 保存
NDJSON 文件
```

### 事件捕获
- 页面交互（点击、输入、导航）
- 控制台消息（log、warn、error）
- 网络请求和响应
- 应用状态变化

## 优势

1. **灵活启动**: 支持 CLI 直接启动和自动启动两种模式
2. **无缝集成**: 开发者无需额外配置，HUD 自动启动
3. **自动依赖管理**: postinstall 脚本自动处理 HUD 依赖安装
4. **实时监控**: 所有操作和日志实时可见
5. **完整记录**: 捕获完整的用户会话用于调试分析
6. **可视化界面**: 直观的三面板设计，信息一目了然
7. **灵活配置**: 支持自定义端口和捕获选项

## 文件结构
```
src/
├── bin.ts                  # CLI 入口点，支持 --hud 选项
├── hud/                    # HUD 应用
│   ├── app/               # Next.js 应用
│   │   ├── layout.tsx     # 应用布局
│   │   └── page.tsx       # 主界面（三面板）
│   ├── components/        # React 组件
│   │   ├── browser.tsx    # 浏览器面板
│   │   ├── terminal.tsx   # 终端面板
│   │   ├── logs.tsx       # 日志面板
│   │   └── controls.tsx   # 控制面板
│   ├── server.js          # HUD 服务器（WebSocket + Next.js）
│   ├── package.json       # HUD 依赖（独立管理）
│   └── next.config.ts     # Next.js 配置
├── utils/
│   └── hud.ts            # HudManager 实现
├── tools/
│   └── capture-run.ts    # 集成 HUD 启动逻辑
└── scripts/
    └── postinstall-node-pty.cjs  # 自动安装 HUD 依赖
```

## 快速开始

### 1. 安装
```bash
npm install vdt-mcp
# 或
pnpm add vdt-mcp
```

### 2. 启动 HUD
```bash
# 直接启动 HUD 和 MCP 服务器
npx vdt-mcp --hud

# 在浏览器中打开: http://localhost:3900
```

### 3. 配置你的开发服务器
- 确保你的开发服务器运行在某个端口（如 http://localhost:3000）
- HUD 的 Browser 面板会显示这个 URL 的内容
- 通过 URL 参数或 Controls 面板可以切换不同的开发服务器

这个实现提供了一个强大的可视化调试环境，让开发者能够实时监控和分析 Web 应用的运行状态。支持从简单的 CLI 启动到完整的会话捕获，满足不同的调试需求。