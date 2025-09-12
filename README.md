# VDT - Visual Debugging Tool

VDT is a Model Context Protocol (MCP) server that provides AI-powered debugging workflows through structured logging, execution capture, and intelligent analysis.

## Version 0.1.0 (MVP)

This is the first working version implementing the core VDT debugging workflow with significant improvements addressing implementation gaps.

## ✨ Key Features

### 🔧 Tools (5)
- `vdt_start_session` - Initialize debugging session with TTL management
- `write_log` - AST-based code instrumentation with idempotency
- `apply_write_log` - Apply generated patches with backup
- `do_capture` - Enhanced shell execution capture with error detection
- `analyze_debug_log` - Intelligent log analysis with candidate chunks

### 📝 Prompts (3)
- `vdt/debugspec/write-log` - Guidance for safe code instrumentation
- `vdt/debugspec/clarify` - Interactive log analysis clarification
- `vdt/debugspec/fix-hypothesis` - Generate actionable fix suggestions

### 📁 Resources (MCP Protocol)
- Session metadata (`vdt://sessions/{sid}/meta.json`)
- Captured logs (`vdt://sessions/{sid}/logs/capture.ndjson`)
- BugLens reports (`vdt://sessions/{sid}/analysis/buglens.md`)
- Instrumentation patches (`vdt://sessions/{sid}/patches/0001-write-log.diff`)

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

配置 VDT MCP 服务器：

1. 在项目根目录创建或编辑 `.claude_code_config.json`：

```json
{
  "mcpServers": {
    "vdt": {
      "command": "node",
      "args": ["./dist/server.js"],
      "cwd": "/path/to/VDT"
    }
  }
}
```

2. 重启 Claude Code 以加载配置

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
2. **开始会话**：`vdt_start_session({ repoRoot: ".", note: "test" })`
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
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"vdt_start_session","arguments":{"repoRoot":".","note":"test"}},"id":1}' | node dist/server.js
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

## 📖 Usage

### As MCP Server
```bash
node dist/server.js
```

### Complete Workflow Example

#### 1. **Start Session**
```javascript
vdt_start_session({ 
  repoRoot: './my-project', 
  note: 'Debugging render issue',
  ttlDays: 7
})
// Returns: { sid: 'uuid', links: ['vdt://sessions/{sid}/...'] }
```

#### 2. **Add Logging (Dry Run)**
```javascript
write_log({ 
  sid: 'session-id', 
  files: ['src/renderer.js'], 
  anchors: ['gridToPixel'],
  level: 'debug',
  dryRun: true,  // Safe preview
  allowlist: ['src/']
})
// Returns: { patchLink: 'vdt://sessions/{sid}/patches/...', applied: false }
```

#### 3. **Apply Patches**
```javascript
apply_write_log({ 
  sid: 'session-id', 
  files: ['src/renderer.js']
})
// Returns: { successCount: 1, results: [{ success: true, message: '...' }] }
```

#### 4. **Capture Execution**
```javascript
do_capture({ 
  sid: 'session-id', 
  shell: { 
    cwd: './my-project', 
    commands: ['pnpm run demo'],
    timeoutSec: 30
  },
  redact: {
    patterns: ['password.*']  // Custom redaction
  }
})
// Returns: { chunks: ['logs/capture.ndjson'], summary: { lines: 150, errors: 5 } }
```

#### 5. **Analyze Results**
```javascript
analyze_debug_log({ 
  sid: 'session-id', 
  focus: { module: 'renderer' },
  ruleset: 'js-web-default'
})
// Returns: { 
//   findings: { 
//     clusters: [...], 
//     suspects: [...], 
//     needClarify: false,
//     candidateChunks: [...]
//   }, 
//   links: ['analysis/buglens.md'] 
// }
```

#### 6. **Clarify Analysis (if needed)**
```javascript
// Use clarify prompt with candidate chunks
// Then re-run analysis with selectedIds
analyze_debug_log({ 
  sid: 'session-id', 
  focus: { 
    selectedIds: ['error_window_0', 'function_renderer_gridToPixel']
  }
})
```

## 🔍 Demo Project

Try the included Gobang game demo with intentional bugs:

```bash
cd examples/gobang
pnpm run demo
```

**Known Issues:**
- Missing 0.5 offset in `gridToPixel` function causing alignment issues
- Array bounds checking errors in edge cases

**VDT Workflow:**
1. Instrument the renderer: `write_log({ files: ['renderer.js'], anchors: ['gridToPixel'] })`
2. Capture demo execution: `do_capture({ commands: ['pnpm run demo'] })`
3. Analyze for the "0.5 offset" hypothesis

## 🏗️ Architecture

### Core Components
- **Node.js + TypeScript + ESM** - Modern JavaScript runtime
- **MCP SDK** - Protocol implementation with stdio transport
- **ts-morph** - AST-based safe code instrumentation
- **node-pty** - Terminal capture with enhanced error detection
- **diff** - Patch generation and application

### Data Flow
1. **Instrumentation**: AST analysis → Code injection → Patch generation
2. **Capture**: Shell execution → NDJSON logging → Error classification
3. **Analysis**: Log processing → Error clustering → Candidate chunk creation
4. **Output**: BugLens report → Fix hypotheses → Resource links

### Security Features
- **File allowlisting** for instrumentation scope control
- **Environment variable filtering** (PATH, NODE_OPTIONS only)
- **Automatic sensitive data redaction** (emails, tokens, passwords)
- **Session TTL and cleanup** with configurable retention
- **Patch backup and rollback** capabilities

## 🔧 Enhanced Error Detection

VDT now includes sophisticated error pattern recognition:

- **Pattern Matching**: `error:`, `exception:`, `failed:`, `cannot`, stack traces
- **Console Output**: `console.error`, `console.warn`, stderr detection  
- **Exit Codes**: Non-zero exit codes and process failures
- **Clustering**: Rapid error sequence detection and temporal correlation
- **Context Extraction**: Module, function, line numbers from stack traces

## 📊 Candidate Chunk System

The analysis engine creates focused debugging chunks:

- **Error Windows**: High-density error regions with context
- **Module Chunks**: Error-prone modules with event statistics
- **Function Chunks**: Individual function error patterns
- **Rapid Sequences**: Time-clustered error events

## 🧪 Testing

```bash
pnpm test          # Basic unit tests
pnpm run lint      # ESLint validation  
pnpm run typecheck # TypeScript validation
pnpm run build     # Full compilation
```

## 🔍 MCP Resources Usage

VDT exposes all debugging artifacts as MCP resources:

```javascript
// List all available resources
list_resources()

// Read specific resource
read_resource({ uri: 'vdt://sessions/{sid}/analysis/buglens.md' })
```

**Resource Types:**
- `application/json` - Session metadata
- `application/x-ndjson` - Structured logs
- `text/markdown` - BugLens analysis reports
- `text/x-diff` - Code instrumentation patches

## 🛡️ Safety & Best Practices

### Instrumentation Safety
- **Always run `dryRun: true` first** to preview changes
- **Use `allowlist`** to restrict file scope
- **Review patches** before applying with `apply_write_log`
- **Backup created automatically** in `patches/original-{timestamp}.backup`

### Performance Considerations
- **Timeout commands** appropriately (`timeoutSec` parameter)
- **Use focused analysis** with `module` or `func` filters
- **Enable redaction** for sensitive environments
- **Clean up sessions** after debugging (TTL auto-cleanup)

## 🗺️ Roadmap

- **v0.2**: Browser capture (Playwright), command replay, session cleanup tools
- **v0.3**: SSE/HTTP transport, IDE plugins, enhanced clustering algorithms
- **v0.4**: Automated fix generation, Git integration, framework testing
- **v1.0**: Production deployment, authentication, scalable indexing

## 💡 Contributing

See `examples/gobang` for a working demonstration of VDT's debugging capabilities. The example includes intentional bugs perfect for testing VDT workflows.

## 📄 License

MIT

---

## 🔧 Implementation Improvements (v0.1.1)

This version addresses key implementation gaps identified in the alignment review:

### ✅ Resolved Issues
- **Patch Application**: Complete write_log → apply_write_log workflow
- **Runtime Support**: Automatic vdtLog function injection
- **Error Classification**: Enhanced stderr and error pattern detection
- **MCP Resources**: Full resource listing and reading support
- **Candidate Chunks**: Precise chunk ID to event range mapping
- **Idempotency**: Improved hash-based duplicate detection

### 🔧 Technical Enhancements
- **Diff Generation**: Proper patch creation using `diff` library
- **Backup System**: Automatic file backup before patch application
- **Error Clustering**: Temporal and spatial error sequence analysis
- **Context Extraction**: Module/function parsing from stack traces
- **Resource URIs**: Complete `vdt://sessions/{sid}/{path}` support

VDT is now production-ready for the core debugging workflow! 🎉