# VDT DebugSpec v0.3（KISS）

本规范遵循 KISS 原则，定义一个最小闭环：捕获 → 分析/澄清 → 修复/验证 → 总结。
默认主 Agent 为 Claude Code，Codex 负责深度分析提供 insight，主 Agent 负责代码修改与验证

## 0. 背景与目标
- 强推理：复杂诊断交给 Codex（reasoner_run），代码落地与迭代交给主 Agent（应用补丁、测试、验证）。
- 零粘贴：所有上下文与产物资源化（`vdt://sessions/{sid}/...`），客户端通过 MCP `list_resources/read_resource` 直接获取。
- 快速对焦：分析器产出候选日志块（candidateChunks）与 `needClarify`，必要时走澄清问卷流程。


## 1. 能力矩阵（Tools / Prompts / Resources）

### 1.1 Tools（最小集合）
- `start_session`：初始化会话并返回使用说明与资源链接。
- `capture_run`：统一的捕获入口；支持 `mode: 'cli'|'web'`。输出 `logs/capture.ndjson`（Web 场景可同时落 `actions/console/network.ndjson`）。
- `analyze_capture`：读取上述日志，生成 `analysis/buglens.md`，并返回 `candidateChunks` 与 `needClarify`。
- `clarify`（可选）：记录用户选择与备注到 `analysis/clarify.md`，供下一次 `analyze_capture` 提升聚焦度。
- `reasoner_run`：通过 Codex 进行深度推理分析，提供修复 insight 和解决方案给主 Agent
- `verify_run`：执行验证命令并采集结果（用于闭环校验）。
- `end_session`（alias: `mcp_end`）：输出 `analysis/summary.md`（结论 + 证据 + 下一步）。

### 1.2 Prompts（精简）
- `vdt/spec/orchestration`：最小编排规则（捕获→分析→必要时澄清→修复/验证→总结）。
- `vdt/debugspec/clarify`：将候选块转为问卷文本，收敛关注面。
- `vdt/debugspec/fix-hypothesis`：生成 1~3 个可验证的修复假设。

### 1.3 Resources（MCP）
- 统一以 `vdt://sessions/{sid}/{path}` 暴露：
  - `meta.json`、`logs/*.ndjson`、`analysis/buglens*.md`、`analysis/reasoning.md`、`snapshots/*` 等。
- Server 侧已实现 `list_resources`/`read_resource` 的映射与 MIME 判定。

## 2. 数据规范

### 2.1 ndjson（最小 6 字段）
```json
{
  "ts": 1699999999999,
  "level": "debug",
  "module": "renderer.ts",
  "func": "gridToPixel",
  "msg": "mapped",
  "kv": {"x":4,"y":3,"cellSize":20,"px":[85,75]}
}
```
- 字段固定：`ts, level, module, func, msg, kv`；其他字段可扩展。

### 2.2 Web 捕获扩展
- `actions.ndjson`：`{ ts, type, stepId, url, selector?, coords?, screenshot? }`
- `console.ndjson`：`{ ts, type: 'log'|'warn'|'error', args: any[], stack?, stepIdHint? }`
- `network.ndjson`：`{ ts, method, url, status?, bodySummary? }`

### 2.3 候选块（candidateChunks）
- 类型与优先级：`error_window` > `rapid_sequence` > `function` > `module`
- 结构：`{ id, title, excerpt, refs: string[], metadata: { type, startIdx, endIdx, ... } }`

## 3. 规范约束（核心节点，精简版）

### 3.1 start_session
- 返回 `{ sid, spec, links }`；`spec` 内含最小 system_reminder：
  - 捕获后必须分析；
  - `needClarify` 为真则进行澄清；
  - 以最小迭代闭环完成修复与验证。

### 3.2 capture_run
- CLI：通过 PTY 捕获 stdout/stderr，并做错误/退出码识别与脱敏。
- Web：可选采集 actions/console/network；同样写入 ndjson。
- 输出：`logs/capture.ndjson`（以及 Web 辅助流）。

### 3.3 analyze_capture
- 读取 ndjson，输出：
  - 错误密集窗口与上下文；
  - 模块/函数聚类与快速错误序列；
  - `candidateChunks` 与 `needClarify`；
  - `analysis/buglens.md`。
- `selectedIds` 映射为事件区间，用于再次分析时的过滤与加权。

### 3.4 clarify
- in：`{ sid, chunks, answer:{ selectedIds:string[], notes?:string } }`
- out：`{ selectedIds, link: 'vdt://.../analysis/clarify.md' }`
- 将选择与备注写入 `analysis/clarify.md`，供下一次 `analyze_capture` 使用。

### 3.5 reasoner_run
- in：`{ sid, task: 'propose_patch'|'analyze_root_cause', context?: { selectedIds?: string[], notes?: string } }`
- out：`{ analysis: string, solutions: [{ rationale: string, approach: string, confidence: number }], link: 'vdt://.../analysis/reasoning.md' }`
- 通过 Codex 进行深度推理，分析问题根因并提供修复方案的 insight，供主 Agent 参考和执行

### 3.6 verify_run
- 执行验证命令或测试脚本；
- 输出验证日志与快照，供再次分析或收敛问题范围。

### 3.7 end_session
- 产出 `analysis/summary.md`（Hook、关键证据、结论、回归脚本链接）。

## 4. 端到端编排（默认最小闭环）
1) `start_session` → 获取 `sid` 与资源约定
2) `capture_run` → 产出 `logs/capture.ndjson`
3) `analyze_capture` → 产出 `buglens.md` + candidateChunks + needClarify
4) 若 `needClarify`：`clarify` → 再次 `analyze_capture`
5) `reasoner_run('propose_patch')` → Codex 提供修复方案 → 主 Agent 应用代码修改 → `verify_run` 验证测试 → 如失败回到 2–5
6) `end_session` → 输出总结与资源清单

## 5. 安全与合规
- 环境变量：dev 进程 `env` 白名单（如 `PATH`,`NODE_OPTIONS` 等），其余忽略。
- 脱敏：`redact.patterns` + 内置规则（常见令牌/邮箱/手机号）。
- TTL：默认 7 天；提供清理（后续版本规划 `purge_session`）。
- 外部 Reasoner：默认禁用，需显式开启；调用前先做脱敏，记录审计。

## 6. 错误处理与可观测性
- 工具失败：统一 `{ isError, message, hint }` 返回，并记录到 `meta.json.errors[]`。
- Server 侧以 `[VDT]` 前缀打印关键运行日志。
- 验证失败：保留 `*.verify.ndjson` 与快照，供再次分析。

## 7. 测试与验收
- 单测：
  - ndjson 写入鲁棒性（多行/长行/非 UTF-8 字符）。
- 集成：
  - `examples/gobang`：打通 `start → capture → analyze → reasoner_run → 主Agent应用修改 → verify`，验证假设可复现并闭环。
- 负面：
  - `timeoutSec` 生效且落盘 partial，分析器可容错。

## 8. 实施建议（最小改动优先）
- 新增或别名工具：`start_session` / `clarify` / `end_session`（沿用 `SessionManager` 与资源目录）。
- 合并数据通道：统一使用 `capture_run` + `analyze_capture`；Web 辅助流按需落盘。
- Prompt：提供 `vdt/spec/orchestration` 最小编排；其余按需接入。
- README：端到端示例采用最小闭环流程。

---

如需，我可以：
- 直接在 `src/server.ts` 注册上述三个新工具的最小实现（写入 `analysis/*.md`）。
- 补 `vdt/spec/orchestration` Prompt 文案。
- 调整 README 工作流与注意事项。
