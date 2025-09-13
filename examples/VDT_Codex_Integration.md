# VDT Codex 集成指南

VDT v0.2 提供了完整的 Reasoner Adapter 架构，支持接入多种 LLM 后端（包括 Codex、OpenAI、OpenRouter 等）进行智能调试分析。

## 快速开始

### 方式 A：通过 Claude 添加 Codex MCP（推荐）

1. **安装 Codex CLI**：
   ```bash
   # 根据 codex 文档安装
   npm install -g codex-cli  # 示例，具体安装方式请参考官方文档
   ```

2. **在 Claude 中添加 Codex MCP**：
   ```bash
   claude mcp add codex -s user -- codex -m gpt-5 -c model_reasoning_effort=high mcp
   ```

3. **直接使用 VDT Prompts**：
   现在可以在 Claude 对话中使用 VDT 的 Prompts：
   - `vdt/debugspec/write-log`
   - `vdt/debugspec/clarify`
   - `vdt/debugspec/fix-hypothesis`

### 方式 B：使用 VDT 内置 Reasoner 工具

1. **配置 Reasoner 后端**：
   ```bash
   # 复制示例配置
   cp examples/reasoners.example.json .vdt/reasoners.json
   ```

2. **设置 API 密钥**（如使用 HTTP 后端）：
   ```bash
   export OPENAI_API_KEY="your-api-key"
   export OPENROUTER_API_KEY="your-openrouter-key"
   ```

3. **使用 reasoner_run 工具**：
   ```javascript
   // 分析日志
   {
     "sid": "session_xxx",
     "task": "analyze_log",
     "inputs": {
       "logs": ["vdt://sessions/session_xxx/logs/console.replay.ndjson"],
       "buglens": "vdt://sessions/session_xxx/analysis/buglens-web.md"
     }
   }
   ```

## 配置详解

### Backend 类型

1. **CLI 后端**（推荐用于 Codex）：
   ```json
   {
     "type": "cli",
     "cmd": "codex",
     "args": ["-m", "gpt-5", "-c", "model_reasoning_effort=high", "exec"],
     "cost_hint": "high"
   }
   ```

2. **HTTP 后端**（OpenAI/OpenRouter）：
   ```json
   {
     "type": "http",
     "base_url": "https://api.openai.com/v1",
     "model": "gpt-4.1-mini",
     "api_key_env": "OPENAI_API_KEY",
     "cost_hint": "low"
   }
   ```

3. **MCP 后端**（通过外部 MCP）：
   ```json
   {
     "type": "mcp",
     "cmd": "codex",
     "cost_hint": "high"
   }
   ```

### 路由策略

- **固定路由**：指定任务类型使用特定后端
- **自动路由**：基于 `reason_score` 动态选择后端

```json
{
  "routing": {
    "propose_patch": "codex",     // 补丁建议用高级模型
    "review_patch": "codex",      // 代码审查用高级模型  
    "analyze_log": "auto"         // 日志分析自动选择
  }
}
```

### Reasoning Score 计算

系统会根据以下指标计算推理复杂度分数（0-1）：

- **error_density** (25%)：错误密度
- **stacktrace_novelty** (20%)：堆栈跟踪新颖性
- **context_span** (15%)：上下文跨度
- **churn_score** (15%)：代码变更频率
- **repeat_failures** (10%)：重复失败率
- **entropy_logs** (10%)：日志熵值
- **spec_mismatch** (5%)：规范不匹配度

分数超过阈值（默认 0.55）时自动选择高级后端。

## 典型工作流

### 1. 日志分析

```javascript
// 使用 reasoner_run 分析录制/重放日志
{
  "sid": "session_xxx", 
  "task": "analyze_log",
  "inputs": {
    "logs": [
      "vdt://sessions/session_xxx/logs/console.replay.ndjson",
      "vdt://sessions/session_xxx/logs/network.replay.ndjson"
    ],
    "buglens": "vdt://sessions/session_xxx/analysis/buglens-web.md"
  },
  "question": "分析五子棋游戏中点击坐标计算错误的原因"
}

// 返回结果
{
  "links": ["vdt://sessions/session_xxx/analysis/reasoner_analyze_log.json"],
  "result": {
    "insights": [
      {
        "title": "坐标映射偏移错误",
        "evidence": ["console.replay.ndjson:15-20"],
        "confidence": 0.85
      }
    ],
    "suspects": [
      {
        "file": "src/renderer.ts", 
        "lines": [45, 70],
        "rationale": "gridToPixel 函数缺少 0.5 偏移"
      }
    ],
    "next_steps": [
      "在 gridToPixel 函数添加调试日志",
      "验证点击坐标与网格交点的对应关系"
    ]
  }
}
```

### 2. 补丁建议

```javascript
// 基于分析结果生成补丁
{
  "sid": "session_xxx",
  "task": "propose_patch", 
  "inputs": {
    "buglens": "vdt://sessions/session_xxx/analysis/buglens-web.md",
    "code": ["file://src/renderer.ts", "file://src/game.ts"]
  },
  "constraints": ["minimal change", "preserve existing API"]
}

// 返回结果包含 patch_suggestion
{
  "result": {
    "patch_suggestion": "diff --git a/src/renderer.ts ...",
    "insights": [...],
    "next_steps": ["添加单元测试验证修复"]
  }
}
```

### 3. 补丁审查

```javascript
// 审查生成的补丁
{
  "sid": "session_xxx",
  "task": "review_patch",
  "inputs": {
    "diff": "vdt://sessions/session_xxx/patches/0001-fix-coord.diff",
    "code": ["file://src/renderer.ts"]
  }
}

// 返回审查结果
{
  "result": {
    "insights": [
      {
        "title": "补丁安全性良好",
        "confidence": 0.9
      }
    ],
    "next_steps": [
      "添加边界条件测试",
      "验证与现有测试的兼容性"
    ]
  }
}
```

## 端到端示例：五子棋调试

```javascript
// 1. 启动 HUD 并录制操作
await hud_start({
  sid: "gobang_debug",
  dev: { cmd: "npm run dev", cwd: "./examples/gobang" },
  browse: { entryUrl: "http://localhost:5173" }
});

await record_start({
  sid: "gobang_debug", 
  entryUrl: "http://localhost:5173"
});

// 2. 用户操作：点击棋盘下棋，发现坐标错误

await record_stop({
  sid: "gobang_debug",
  recordId: "rec_001", 
  export: ["playwright", "json"]
});

// 3. 重放并采集数据
await replay_run({
  sid: "gobang_debug",
  script: "vdt://sessions/gobang_debug/scripts/rec_001.spec.ts",
  mode: "headed"
});

// 4. 生成 BugLens 报告
await analyze_web_capture({
  sid: "gobang_debug"
});

// 5. 使用 AI 深度分析
await reasoner_run({
  sid: "gobang_debug",
  task: "analyze_log", 
  inputs: {
    logs: ["vdt://sessions/gobang_debug/logs/console.replay.ndjson"],
    buglens: "vdt://sessions/gobang_debug/analysis/buglens-web.md"
  }
});

// 6. 生成修复补丁
await reasoner_run({
  sid: "gobang_debug",
  task: "propose_patch",
  inputs: {
    buglens: "vdt://sessions/gobang_debug/analysis/buglens-web.md", 
    code: ["file://examples/gobang/renderer.js"]
  }
});
```

## 安全与合规

- **自动脱敏**：默认启用，过滤 API 密钥、邮箱等敏感信息
- **超时控制**：防止长时间执行，默认 90-120 秒
- **成本控制**：根据 `cost_hint` 和使用频率选择合适的模型
- **审计日志**：记录所有 Reasoner 调用的模型、耗时、Token 估计

## 故障排除

1. **Codex 不可用**：
   - 检查 codex CLI 是否正确安装
   - 验证模型访问权限
   - 查看 `.vdt/reasoners.json` 配置

2. **API 密钥错误**：
   - 确认环境变量设置正确
   - 检查 API 密钥有效性和余额

3. **超时错误**：
   - 增加 `timeouts` 配置中的秒数
   - 减少输入上下文长度

4. **JSON 解析错误**：
   - 模型返回了非 JSON 格式
   - 系统会自动重试并提示模型仅返回 JSON

## 扩展开发

添加新的 LLM 后端只需：

1. 继承 `ReasonerDriver` 基类
2. 实现 `execute` 方法
3. 在 `ReasonerAdapter` 中注册驱动器
4. 更新配置文件支持新后端

更多详细文档请参考 `memory-bank/reasoner-adapter.md`。