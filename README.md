# VDT - Visual Debugging Tool

VDT is a Model Context Protocol (MCP) server that provides AI-powered debugging workflows through structured logging, execution capture, and intelligent analysis.

## ✨ 项目简介

VDT —— The Vibe Debugging Tool.

- VDT means **Verify · Diagnose · Tune**
- VDT also means **Visualize · Debug · Test**

### 我们要解决什么问题

- 但凡不能“一口气”生成可用结果，开发精力往往变成：20% 写代码（Vibe Coding），80% 调试（Vibe Debugging）。
- 对于 LLM 协助的提交，调试时间通常与“古法编程”调试相当，甚至更麻烦：上下文分散、复现场景困难、证据不可回放。

### 我们如何解决

- **统一的 MCP 调试服务**：以 MCP Server 形态提供能力，任何支持 MCP 的 IDE/Agent 可即插即用。
- **Spec Prompt 串起工具链**：`mcp_start` 向主 Agent 说明如何使用一组工具（`write_log`、`do_capture`、`analyze_debug_log`、`clarify_tool`、`verify_run`、`end_session`），把调试流程标准化。
- **do_capture：可回放的“现场”**：一键拉起复现环境（如浏览器 + tmux/bash），捕获终端输出与前端 console；由用户/Agent 复现后点“继续”，沉淀完整调试输入。
- **analyze_debug_log：子代理分析**：读取基线说明 + 捕获日志，自动归因与给出下一步；必要时触发 `clarify_tool` 补齐关键信息。
- **clarify_tool：大日志也能对齐认知**：把庞大日志分组，生成选择题/问答请用户裁剪关键块；收集澄清后回写文档，并约定再次分析。
- **write_log：结构化日志约束**：指导主 Agent 以约定格式添加日志；我们在其基础上仅补日志，不改行为，保证可比性与可回放。
- **产出 BugLens 文档与总结钩子**：每轮形成可共享、可回归的调试资产，支持对比/评分与团队协作。
- **与 GPT‑5/Codex 优势互补**：用“硬解 + 程序化工具”减少手工粘贴上下文、反复试错，帮你快速聚焦关键日志与决定性信号。

### 一个直觉性的示例

“@VDT，我的五子棋的棋子现在落到格子中间了，应该落到线上。”

## 🚀 Installation

```bash
pnpm install
pnpm run build
```

## 🤖 AI Agent 集成

### Cursor IDE

在 Cursor 中配置 VDT MCP：

1. 打开 Cursor Settings (Cmd/Ctrl + ,)
2. 搜索 "MCP" 或进入 Features > Model Context Protocol
3. 添加新的 MCP 服务器配置：

```json
{
  "mcpServers": {
    "vdt": {
      "command": "node",
      "args": ["/path/to/VDT/dist/server.js"],
      "env": {}
    }
  }
}
```

### Claude Code

配置 VDT MCP 服务器有两种方式：

#### 方式一：使用命令行工具（推荐）

```bash
claude mcp add vdt node /Users/agrimonia/playground/VDT/dist/server.js
```

其他管理命令：
- `claude mcp list` - 查看已配置的服务器
- `claude mcp remove vdt` - 移除服务器
- `claude mcp test vdt` - 测试连接

配置完成后重启 Claude Code 以加载配置。

### GitHub Copilot / Codex

对于支持 MCP 的客户端，添加服务器配置：

```json
{
  "mcp": {
    "servers": [
      {
        "name": "vdt",
        "command": ["node", "/path/to/VDT/dist/server.js"],
        "transport": "stdio"
      }
    ]
  }
}
```

### 通用 MCP 客户端

对于任何支持 MCP 的客户端：

```bash
# 启动 VDT MCP 服务器
node /path/to/VDT/dist/server.js

# 或使用 stdio 传输
echo '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | node dist/server.js
```

### 验证安装

在 AI 助手中使用以下命令验证 VDT 功能：

1. **列出可用工具**：查看是否显示 5 个 VDT 工具
2. **开始会话**：`start_session({ repoRoot: ".", note: "test" })`
3. **列出资源**：检查会话资源是否可访问

## 🛠️ 本地开发与调试

### 开发环境配置

```bash
# 克隆项目
git clone <repository-url>
cd VDT

# 安装依赖
pnpm install

# 构建项目
pnpm run build

# 开发模式（监听文件变化）
pnpm run dev
```

### MCP 服务器调试

#### 1. 直接测试 MCP 协议

```bash
# 测试服务器基本功能
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"resources":{},"tools":{}}},"id":1}' | node dist/server.js

# 列出所有工具
echo '{"jsonrpc":"2.0","method":"tools/list","id":2}' | node dist/server.js

# 列出所有提示
echo '{"jsonrpc":"2.0","method":"prompts/list","id":3}' | node dist/server.js
```

#### 2. 使用 MCP Inspector

使用官方 MCP Inspector 进行交互式调试（推荐方式）：

```bash
# 直接使用 npx 启动 Inspector（无需安装）
npx @modelcontextprotocol/inspector node dist/server.js

# 或者传递参数给服务器
npx @modelcontextprotocol/inspector node dist/server.js --debug

# 如果已全局安装，也可以使用
npm install -g @modelcontextprotocol/inspector
mcp-inspector node dist/server.js
```

Inspector 将在浏览器中打开，提供以下功能：
- **服务器连接面板**：查看连接状态
- **工具标签页**：测试所有 5 个 VDT 工具
- **提示标签页**：浏览 3 个调试提示
- **资源标签页**：查看会话资源
- **通知面板**：监控 MCP 消息

**开发工作流**：
1. 启动 Inspector → 2. 验证连接 → 3. 修改代码 → 4. 重新构建 → 5. 重连 Inspector → 6. 测试功能

#### 3. IDE 中调试

**VS Code 调试配置** (`.vscode/launch.json`)：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug MCP Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/server.js",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

#### 4. 日志调试

启用详细日志输出：

```bash
# 设置环境变量启用调试日志
DEBUG=vdt:* node dist/server.js

# 或使用内置日志级别
LOG_LEVEL=debug node dist/server.js
```

### 常见开发任务

#### 添加新工具

1. 在 `src/tools/` 目录下创建新的工具文件
2. 在 `src/server.ts` 中注册新工具
3. 更新类型定义和 schema
4. 重新构建项目

```bash
# 构建并测试新工具
pnpm run build
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/server.js
```

#### 修改现有功能

```bash
# 监听模式开发
pnpm run dev  # 自动重新构建

# 在另一个终端测试
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"start_session","arguments":{"repoRoot":".","note":"test"}},"id":1}' | node dist/server.js
```

### 测试工作流

```bash
# 运行单元测试
pnpm test

# 代码格式检查
pnpm run lint

# 类型检查
pnpm run typecheck

# 完整验证
pnpm run build && pnpm test && pnpm run lint
```

### 常见问题排查

#### MCP 连接问题

```bash
# 检查服务器是否正常启动
node dist/server.js < /dev/null

# 验证 JSON-RPC 格式
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}},"id":1}' | node dist/server.js | jq .
```

#### 会话管理调试

```bash
# 检查会话目录
ls -la .vdt-sessions/

# 查看会话元数据
cat .vdt-sessions/*/meta.json | jq .

# 清理测试会话
rm -rf .vdt-sessions/test-*
```

#### 工具执行调试

在代码中添加调试日志：

```typescript
// 在工具函数中添加
console.error('DEBUG:', JSON.stringify(args, null, 2));
```

### 贡献开发

1. **Fork 项目**并创建功能分支
2. **遵循代码规范**：使用 ESLint 和 TypeScript
3. **添加测试**：为新功能编写单元测试
4. **更新文档**：修改 README 和相关文档
5. **提交 PR**：包含清晰的变更说明
