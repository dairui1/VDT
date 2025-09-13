# VDT v0.2 Web Debug HUD 演示

VDT v0.2 版本实现了完整的Web调试HUD，支持实时监控开发服务器、录制用户操作、重放脚本和生成BugLens-Web分析报告。

## 快速开始

### 1. 启动调试会话

首先创建一个新的调试会话：

```javascript
// 使用vdt_start_session工具
{
  "repoRoot": "/path/to/your/project",
  "note": "五子棋游戏调试会话",
  "ttlDays": 7
}
// 返回：{ "sid": "session_xxx", "links": [...] }
```

### 2. 启动HUD

启动开发服务器和浏览器HUD：

```javascript
// 使用hud_start工具
{
  "sid": "session_xxx",
  "dev": {
    "cmd": "npm run dev",
    "cwd": "/path/to/VDT/examples/gobang",
    "env": {}
  },
  "browse": {
    "entryUrl": "http://localhost:5173",
    "autoOpen": true
  },
  "capture": {
    "screenshot": { "mode": "onAction" },
    "network": "summary",
    "redact": { "patterns": ["Bearer\\s+\\S+"] }
  }
}
// 返回：{ "hudUrl": "http://127.0.0.1:7788/hud/session_xxx", "links": [...] }
```

打开返回的hudUrl即可看到调试HUD界面，包含：
- 左侧：开发服务器终端输出
- 右上：用户操作时间线
- 右下：控制台和网络事件

### 3. 录制用户操作

开始录制用户在浏览器中的操作：

```javascript
// 使用record_start工具
{
  "sid": "session_xxx",
  "entryUrl": "http://localhost:5173",
  "selectors": {
    "prefer": ["[data-testid]", "[role]", "text"]
  },
  "screenshot": { "mode": "onAction" }
}
// 返回：{ "recordId": "rec_xxx", "links": [...] }
```

在浏览器中进行游戏操作（点击棋盘、按钮等），所有动作都会被记录。

### 4. 停止录制并导出脚本

```javascript
// 使用record_stop工具
{
  "sid": "session_xxx",
  "recordId": "rec_xxx",
  "export": ["playwright", "json"]
}
// 返回：{ 
//   "script": {
//     "playwright": "vdt://sessions/session_xxx/scripts/rec_xxx.spec.ts",
//     "json": "vdt://sessions/session_xxx/scripts/rec_xxx.actions.json"
//   },
//   "links": [...]
// }
```

### 5. 重放脚本

使用生成的脚本进行自动化重放：

```javascript
// 使用replay_run工具
{
  "sid": "session_xxx",
  "script": "vdt://sessions/session_xxx/scripts/rec_xxx.spec.ts",
  "mode": "headed",
  "stability": {
    "networkIdleMs": 500,
    "uiIdleMs": 200,
    "seed": 42,
    "freezeTime": true
  },
  "mocks": {
    "enable": true,
    "rules": []
  }
}
// 返回：{ 
//   "passed": true,
//   "summary": { "steps": 7 },
//   "links": [...]
// }
```

### 6. 生成BugLens-Web分析

分析录制和重放的数据，生成调试报告：

```javascript
// 使用analyze_web_capture工具
{
  "sid": "session_xxx",
  "focus": "error_analysis",
  "topk": 3
}
// 返回：{
//   "links": ["vdt://sessions/session_xxx/analysis/buglens-web.md"],
//   "findings": {...}
// }
```

## 示例场景：五子棋游戏调试

### 场景1：录制正常游戏流程

1. 启动HUD并访问五子棋游戏
2. 开始录制
3. 执行以下操作：
   - 点击游戏画板放置黑棋
   - 点击不同位置放置白棋
   - 点击"重新开始"按钮
   - 点击"自动对局"观看AI演示
4. 停止录制，导出Playwright脚本

### 场景2：发现并分析bug

1. 重放之前录制的脚本
2. 在HUD中观察：
   - 终端输出是否有错误
   - 控制台是否有JavaScript错误
   - 网络请求是否失败
3. 使用analyze_web_capture生成BugLens-Web报告
4. 查看报告中的错误假设和修复建议

### 场景3：性能分析

1. 录制包含大量操作的会话
2. 在HUD中观察网络请求时序
3. 分析console.time日志查看性能瓶颈
4. 使用BugLens-Web报告识别性能热点

## 目录结构

录制和分析的所有数据都保存在`.vdt/sessions/{sid}/`目录下：

```
.vdt/sessions/{sid}/
├── meta.json                    # 会话元数据
├── logs/
│   ├── devserver.ndjson        # 开发服务器输出
│   ├── actions.rec.ndjson      # 录制的用户操作
│   ├── console.rec.ndjson      # 录制的控制台日志  
│   ├── network.rec.ndjson      # 录制的网络事件
│   ├── actions.replay.ndjson   # 重放的用户操作
│   ├── console.replay.ndjson   # 重放的控制台日志
│   └── network.replay.ndjson   # 重放的网络事件
├── snapshots/
│   ├── rec_{id}/               # 录制截图
│   └── replay_{ts}/            # 重放截图
├── scripts/
│   ├── rec_{id}.spec.ts        # Playwright测试脚本
│   └── rec_{id}.actions.json   # JSON格式的操作记录
└── analysis/
    └── buglens-web.md          # BugLens-Web分析报告
```

## 注意事项

1. **安全性**：
   - 开发服务器环境变量受白名单限制
   - 支持敏感信息脱敏（redact patterns）
   - 默认只允许localhost域名

2. **稳定性**：
   - 优先使用data-testid选择器
   - 自动等待网络和UI稳定
   - 支持随机种子确保重放一致性

3. **性能**：
   - 日志文件采用NDJSON格式，支持流式处理
   - 截图按需保存，避免存储爆炸
   - WebSocket实时推送，减少轮询开销

## 故障排除

1. **HUD无法连接**：检查端口7788是否被占用
2. **录制失败**：确保浏览器已正确启动且页面可访问
3. **重放不稳定**：调整stability参数，增加等待时间
4. **分析报告为空**：检查是否有足够的录制数据