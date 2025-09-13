# VDT：Web Debug HUD 方案（v0.2 新版）

本方案基于近期讨论，面向 Web 项目的真实调试场景，围绕“在 HUD 中运行项目（终端 + 浏览器）→ 捕获操作路径与浏览器日志 → 资源化落盘 → 通过 MCP 返回给主 Agent → 生成 BugLens-Web/触发修复”的闭环设计。

---

## 0. 目标与边界

**目标（v0.1）**
- 在一个 HUD 内同时完成：
  - 启/停 dev 进程（xterm 终端流）
  - 浏览器会话（捕获操作路径、URL、DOM 选择器、截图、console/error、网络摘要）
  - 录制→导出→重放脚本，重放时自动采集日志与快照
  - 所有产物资源化落盘，MCP 以链接返回，主 Agent 用于生成 BugLens-Web 与修复建议
- UI 尽量“薄”，核心逻辑在 VDT MCP Server；HUD 可嵌 IDE 面板或本地 Web UI

**暂不做（后续版本）**
- 深度网络抓包（完整 HAR/Body）、云远程容器/传输、像素级浏览器镜像（trace viewer/WebRTC）、自动生成 PR/patch、跨框架测试深度集成

---

## 1. 架构概览

```
┌─────────────────────────────────────────┐
│             VDT MCP Server             │
│  (Node/TS, ESM, StdioServerTransport)  │
│                                         │
│  Tools:                                 │
│   - vdt_start_session                   │
│   - hud_start / hud_status / hud_stop   │
│   - record_start / record_stop          │
│   - replay_run                          │
│   - analyze_web_capture                 │
│                                         │
│  Capture Engines:                       │
│   - PTY(shell)  -> ndjson: devserver    │
│   - Playwright/CDP -> ndjson: actions,  │
│                          console, net   │
│   - Snapshots (png/webm)                │
│                                         │
│  .vdt/sessions/{sid}/... (Resources)    │
└─────────────────────────────────────────┘
               ▲                 ▲
               │ WebSocket       │ MCP
               ▼                 ▼
     ┌──────────────────┐   主 Agent / IDE
     │   Debug HUD UI   │   （Claude Code/Cursor…）
     │  (React + xterm) │
     └──────────────────┘
```

---

## 2. MCP 接口（v0.1）

### 2.1 Prompts（3 个）
- `vdt/debugspec/write-log`：约束“只加日志、不改逻辑”，统一 ndjson 字段（ts, level, module, func, msg, kv）
- `vdt/debugspec/clarify`：把长日志分块为选项，用户/主 Agent 选择关注块（返回 selectedIds[]）
- `vdt/debugspec/fix-hypothesis`：基于 BugLens 产出 1~3 个修复假设与验证步骤

> Prompts 用于指导 LLM，不产生文件。

### 2.2 Tools（核心 8 个）

1) vdt_start_session
- in: `{ repoRoot?, note?, ttlDays? }`
- out: `{ sid, links:["vdt://sessions/{sid}/analysis/buglens-web.md"] }`
- 动作：创建 `.vdt/sessions/{sid}` 与 `meta.json`

2) hud_start（起 dev + 浏览器 + 事件流）
- in:
```json
{
  "sid": "<sid>",
  "dev": { "cmd": "npm run dev", "cwd": ".", "env": {} },
  "browse": { "entryUrl": "http://localhost:5173", "autoOpen": true },
  "capture": {
    "screenshot": "onAction",           // "none" | "onAction" | "interval(1000)"
    "network": "summary",               // "off" | "summary"
    "redact": { "patterns": ["Bearer\\s+\\S+"] }
  }
}
```
- out:
```json
{
  "sid": "<sid>",
  "hudUrl": "http://127.0.0.1:7788/hud/<sid>",
  "links": [
    "vdt://sessions/<sid>/logs/devserver.ndjson",
    "vdt://sessions/<sid>/logs/actions.ndjson",
    "vdt://sessions/<sid>/logs/console.ndjson",
    "vdt://sessions/<sid>/logs/network.ndjson"
  ]
}
```
- 动作：node-pty 启 dev 进程；Playwright 打开 entryUrl；注册监听并落盘 ndjson；WS 推送事件给 HUD

3) hud_status
- in: `{ sid }`
- out:
```json
{
  "dev": { "status": "running|exited", "pid": 12345 },
  "browser": { "status": "ready|closed", "pages": 1 },
  "recent": { "actions": 3, "errors": 0, "consoleErrors": 1 },
  "links": ["...ndjson", "...png"]
}
```

4) hud_stop
- in: `{ sid, saveTrace?: true }`
- out: `{ "stopped": true, "links": [".../actions.ndjson",".../console.ndjson",".../trace.zip"] }`

5) record_start（开始录制一次操作会话）
- in: `{ sid, entryUrl, selectors?:{ prefer:["[data-testid]","role","text"] }, screenshot?:"onAction" }`
- out: `{ recordId:"rec_0001", links:["vdt://.../logs/actions.rec.ndjson"] }`
- 说明：启 Playwright/CDP 监听，写 `actions.rec.ndjson`，并按动作存 `snapshots/rec_0001/*.png`

6) record_stop（结束录制并导出脚本）
- in: `{ sid, recordId, export:["playwright","json"] }`
- out:
```json
{
  "script": {
    "playwright": "vdt://sessions/<sid>/scripts/rec_0001.spec.ts",
    "json": "vdt://sessions/<sid>/scripts/rec_0001.actions.json"
  },
  "links": [
    "vdt://sessions/<sid>/logs/actions.rec.ndjson",
    "vdt://sessions/<sid>/snapshots/rec_0001/act_00012.png"
  ]
}
```

7) replay_run（重放脚本并自动采集）
- in:
```json
{
  "sid": "<sid>",
  "script": "vdt://sessions/<sid>/scripts/rec_0001.spec.ts",
  "mode": "headless",
  "stability": { "networkIdleMs": 500, "uiIdleMs": 200, "seed": 42, "freezeTime": true },
  "mocks": { "enable": true, "rules": [{"url":"/autosave","method":"POST","respond": {"status":200,"body":"OK"}}] }
}
```
- out:
```json
{
  "passed": false,
  "summary": { "steps": 7, "failStep": "act_00012" },
  "links": [
    "vdt://sessions/<sid>/logs/console.replay.ndjson",
    "vdt://sessions/<sid>/logs/network.replay.ndjson",
    "vdt://sessions/<sid>/logs/errors.replay.ndjson",
    "vdt://sessions/<sid>/snapshots/replay_2025-09-13/act_00012.png",
    "vdt://sessions/<sid>/analysis/buglens-web.md"
  ]
}
```

8) analyze_web_capture（生成 BugLens-Web）
- in: `{ sid, focus?, topk?:3 }`
- out: `{ links:["vdt://.../analysis/buglens-web.md"], findings }`
- 读取本次 capture/replay ndjson + 快照，按 stepId/时间窗关联 console/error/network

> 以上所有工具的大对象一律用 ResourceLink（`vdt://sessions/...`）返回，避免上下文爆炸。

#### TypeScript 接口摘录（可直接落地）

```ts
// hud_start
export type HudStartIn = {
  sid: string;
  dev: { cmd: string; cwd: string; env?: Record<string,string> };
  browse: { entryUrl: string; autoOpen?: boolean };
  capture?: {
    screenshot?: 'none'|'onAction'|`interval(${number})`;
    network?: 'off'|'summary';
    redact?: { patterns?: string[] };
  };
};

export type HudStartOut = {
  sid: string;
  hudUrl: string;
  links: string[]; // ResourceLinks to ndjson files
};

export type RecordStartIn = {
  sid: string;
  entryUrl: string;
  selectors?: { prefer: string[] };
  screenshot?: 'none'|'onAction'|`interval(${number})`;
};

export type RecordStopIn = {
  sid: string;
  recordId: string;
  export: Array<'playwright'|'json'>;
};

export type ReplayRunIn = {
  sid: string;
  script: string; // vdt:// link
  mode?: 'headless'|'headed';
  stability?: { networkIdleMs?: number; uiIdleMs?: number; seed?: number; freezeTime?: boolean };
  mocks?: { enable?: boolean; rules?: Array<{ url: string; method?: string; respond: any }>};
};
```

---

## 3. 数据与目录规范

### 3.1 目录
```
.vdt/
  sessions/{sid}/
    meta.json
    logs/
      devserver.ndjson
      actions.ndjson              # HUD 常规会话（可选）
      console.ndjson              # HUD 常规会话（可选）
      errors.ndjson               # HUD 常规会话（可选）
      network.ndjson              # HUD 常规会话（可选）
      actions.rec.ndjson          # 录制
      console.rec.ndjson
      errors.rec.ndjson
      network.rec.ndjson
      actions.replay.ndjson       # 重放
      console.replay.ndjson
      errors.replay.ndjson
      network.replay.ndjson
    snapshots/
      rec_{id}/act_00012.png
      replay_{ts}/act_00012.png
    scripts/
      rec_{id}.actions.json
      rec_{id}.spec.ts
    analysis/
      buglens-web.md
```

### 3.2 事件 ndjson（最小字段）

终端（devserver.ndjson）
```json
{ "ts": 1699999999999, "stream":"stdout", "level":"info", "msg":"[vite] ready in 123ms" }
```

动作（actions.*.ndjson）
```json
{ "ts":1699999999999, "type":"click|input|navigate|keydown|drag",
  "url":"http://localhost:5173/excalidraw",
  "selector":"data-testid=table-tool",
  "selectorMeta":{"strategy":"data-testid","fallbacks":["role=button[name=Table]","text=Table"]},
  "value":"3x4","coords":{"x":532,"y":310},
  "screenshot":"snapshots/rec_0001/act_00012.png", "stepId":"act_00012" }
```

console（console.*.ndjson）
```json
{ "ts":1699999999999, "type":"error|warn|log",
  "args":["mapped",{"x":4,"y":3}], "stack":"renderer.ts:120:14", "stepIdHint":"act_00012" }
```

网络摘要（network.*.ndjson）
```json
{ "ts":1699999999999, "phase":"request|response|failed", "method":"POST",
  "url":"/autosave", "status":200, "timing":{"ttfb":40}, "bytes":1024,
  "reqId":"net_00341", "stepIdHint":"act_00012" }
```

### 3.3 BugLens-Web 模板（v0.1）
```md
# BugLens-Web v0.1

## Context
- session: {sid}, script: {rec_xxx.spec.ts}
- env: node@20, chromium@<ver>, baseUrl={...}

## Reproduction Path (excerpt)
1) navigate /excalidraw (act_00001)
2) click [data-testid=table-tool] (act_00002)
3) click canvas (532,310) (act_00003) ![snap](../snapshots/replay_.../act_00003.png)

## Key Console & Errors
- [error] renderer.ts:120 → "mapped px(85,75)" kv={"x":4,"y":3,"cell":20} (linked to act_00003)

## Hypotheses
1) 缺少 0.5 偏移导致落点在格心而非交点  
   - Evidence: 重放可稳定复现；坐标计算与网格对齐不一致  
   - Verify: 断言落点与交点误差在 ±1px

## Suggested Patch
- gridToPixel(x,y): return ((x+0.5)*cellSize, (y+0.5)*cellSize)
```

---

## 4. HUD 前端（最小版）
- 技术：React + xterm.js + 列表式 Event Viewer
- 布局：左侧 Xterm（dev 输出）；右上 动作时间线；右下 console/error/网络摘要（筛选）
- 事件来源：WebSocket 订阅 devserver/actions/console/network；同时落盘
- 浏览器画面：v0.1 不做镜像，使用真实 Chrome + 关键动作截图；v0.2 再考虑 trace viewer/WebRTC

---

## 5. 录制→重放 稳定性策略
- 选择器优先级：`[data-testid]` > `role/name` > `text` > 稳定 CSS（避免 nth-child）；录制保存 fallbacks，重放失败自动降级；记录 `selector.repair.ndjson`
- 等待策略：`networkIdleMs` + `uiIdleMs`（MutationObserver/RAF 采样 DOM 稳定度）；Playwright `locator` 自动等待
- 确定性：注入 `seed`；冻结 `Date.now`；关闭动画（prefers-reduced-motion）；必要 API mock
- 动作容错：click→dblclick 回退；input 优先 `fill()`；drag 从最少路径到细粒度回退
- 证据对齐：以 `stepId` 时间窗（±500ms）关联 console/network/error，BugLens 标注“哪一步导致错误”

---

## 6. 安全与合规
- 域名白名单：默认仅允许 `localhost`/指定域名；跨域静默忽略
- 脱敏：`redact.patterns` 应用于 devserver/console/network 文本（常见令牌/邮箱/手机号规则）
- 最小写入：仅写 `.vdt/sessions/{sid}`；插桩改码由 `write_log` 工具，受 allowlist 管控；默认 `dryRun` 输出 diff 供审核
- TTL：session 产物默认 7 天；提供 `purge_session`（v0.2）

---

## 7. 实施步骤（两周量级骨干）
1) MCP：注册 `hud_* / record_* / replay_run / analyze_web_capture` + 延用 `vdt_start_session`
2) PTY：基于 `node-pty` + xterm WS 通道 + `devserver.ndjson` 落盘
3) Playwright：监听 actions/console/network/errors，序列化为 ndjson + 截图
4) HUD UI：React + xterm.js + 事件面板（WS 订阅）
5) Analyzer：在 `analyze_web_capture` 中实现“错误密集窗口 + 动作关联 + BugLens-Web 生成”
6) 示例工程：`examples/gobang` 一键演示；补若干 `[data-testid]`

---

## 8. 典型使用（Excalidraw Table Tool 痛点）
1) `vdt_start_session` → 得到 `sid`
2) `hud_start` → 启 dev + 浏览器；HUD 展示控制台与事件
3) `record_start`（entryUrl 指向 excalidraw 路由）→ 在真实浏览器里完成“添加表格”一次
4) `record_stop` → 生成 `rec_0001.spec.ts` 与 `rec_0001.actions.json`
5) `replay_run`（headless/headed）→ 自动捕获 `*.replay.ndjson` + 快照
6) `analyze_web_capture` → 生成 `buglens-web.md`，主 Agent 结合堆栈/源码出修复建议或 patch 草案

---

## 9. 路线图
- v0.2
  - `hud_start.screenshot = interval(ms)`；小窗镜像（Playwright 截屏/WebRTC）
  - `replay_tool`：将 `actions.ndjson` 生成 Playwright 脚本，支持 CI 回归
  - `purge_session`：按 TTL 清理
- v0.3
  - 网络深度采集（HAR 摘要）；错误相关请求重点标记
  - 选择器稳定化策略提升；IDE 内嵌预览与源代码定位（stack/SourceMap）
- v0.4
  - 自动修复草案：结合 BugLens-Web + 源上下文产出 patch 草案
  - 多页面/多标签会话管理与跨导航链路追踪（traceId）

---

## 10. 备注
- 与现有 MVP（`do_capture` + `analyze_debug_log`）兼容：Web HUD 的 ndjson 结构与分析器共享
- 示例工程优先复用现有 `examples/gobang`，后续补 `examples/excalidraw-like` 骨架

