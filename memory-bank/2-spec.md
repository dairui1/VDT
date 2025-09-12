没问题！下面给出 **VDT 第一版本（MVP）方案**（可直接落地）+ **后续发展路线图**。我会用“目标—范围—架构—接口—数据—流程—安全—测试—里程碑—指标—风险”这套结构，让你能按此开工实现。

---

# VDT MVP（v0.1）方案

## 0. 设计目标 & 非目标

**目标（MVP 必须达成）**

* 以 **DebugSpec** 为核心，串起：插桩（只加日志）→ 复现与捕获 → 日志分析 → BugLens 输出 →（可选）澄清。
* 客户端（主 Agent/IDE）能以 **MCP Tools + Prompts + Resources** 使用全流程，无需绑定特定 IDE。
* 产物 **资源化** 落地到 `.vdt/sessions/{sid}/…`，上下文可被下游 Agent 随取随用。
* 工程动作**安全可控**（只对 allowlist 文件插桩；捕获时默认脱敏）。

**非目标（MVP 暂不做）**

* 浏览器/GUI 自动化捕获（Playwright）——延后到 v0.2。
* 复杂状态机与后台长任务 —— 先做同步/短任务，长任务通过“多次调用 + 分段返回”模拟。
* 测试框架级集成（Jest/Pytest）——先做“命令回放”式验证在 v0.2。
* 远程传输（SSE/HTTP）——MVP 走 stdio。

---

## 1. 系统概览

### 1.1 组件

* **VDT MCP Server**（Node.js + TypeScript，ESM）

  * 使用 `@modelcontextprotocol/sdk` + `StdioServerTransport`
  * 暴露：Prompts（3 个）+ Tools（4 个）+ Resources（文件系统）
* **产物目录**：`.vdt/sessions/{sid}/`

  * `logs/`、`analysis/`、`patches/`、`meta.json`
* **调用方**：主 Agent/IDE（Claude Code、Cursor、Zed…）

### 1.2 DebugSpec（MVP）

* **Prompts**：

  1. `vdt/debugspec/write-log`（约束插桩）
  2. `vdt/debugspec/clarify`（日志分块澄清）
  3. `vdt/debugspec/fix-hypothesis`（修复假设与验证建议）
* **Tools**：

  1. `vdt_start_session`
  2. `write_log`
  3. `do_capture`（MVP 仅 shell）
  4. `analyze_debug_log`
     （澄清通过 Prompt + 客户端回传所选 id，MVP 不单独做 `clarify_tool`）

---

## 2. 接口设计（MCP）

### 2.1 Prompts（registerPrompt）

**A. `vdt/debugspec/write-log`**

* **params**: `{ module:string[], anchors?:string[], level?:"trace"|"debug"|"info"|"warn"|"error", format?:"ndjson", notes?:string }`
* **intent**：指导主 Agent 只在指定模块/锚点**插入结构化日志**，不改逻辑；给出示例与字段规范。

**B. `vdt/debugspec/clarify`**

* **params**: `{ chunks: Array<{id:string, title:string, excerpt:string, refs:string[]}>, multi?:boolean, question?:string }`
* **intent**：以 Markdown 问卷形式展示候选日志块；客户端将选择结果再喂给 `analyze_debug_log` 的 `focus`。

**C. `vdt/debugspec/fix-hypothesis`**

* **params**: `{ buglens_uri:string, top_k?:number }`
* **intent**：按 BugLens 输出 1\~3 个修复假设和验证步骤（含回归风险提示）。

> Prompts 仅返回**文本提示**（面向 LLM），不产出文件。

---

### 2.2 Tools（registerTool）

**1) `vdt_start_session`**

* **in**: `{ repoRoot?:string, note?:string, ttlDays?:number }`
* **out**: `{ sid:string, links:string[] }`

  * `links` 至少包含：`vdt://sessions/{sid}/analysis/buglens.md`
* **动作**：生成 `{sid}`、创建目录、写 `meta.json`

**2) `write_log`（幂等 AST 插桩）**

* **in**: `{ sid:string, files:string[], anchors?:string[], level?:"trace"|"debug"|"info"|"warn"|"error", format?:"ndjson", dryRun?:boolean, allowlist?:string[] }`
* **out**: `{ diff:string /*ResourceLink*/, applied:boolean, hints?:string[] }`
* **要点**：

  * 仅对 `allowlist`/`files` 作用；AST 插入日志语句（`VDT:` 指纹注释 + 统一调用 `vdtLog({...})`）
  * `dryRun=true` 时仅生成 `patch.diff` 不落地；确认后再应用
  * 生成：`.vdt/sessions/{sid}/patches/0001-write-log.diff`

**3) `do_capture`（shell）**

* **in**: `{ sid:string, shell:{ cwd:string, commands?:string[], env?:Record<string,string>, timeoutSec?:number }, redact?:{patterns?:string[]} }`
* **out**: `{ chunks:string[] /*ResourceLinks*/, summary:{ lines:number, errors:number } }`
* **实现**：

  * `node-pty` 逐行读 stdout/stderr，转为 **ndjson** 写入 `logs/capture.ndjson`
  * 行格式见数据规范；stderr 记 `level:error`
  * 脱敏：对 `patterns` 命中内容替换为 `***`

**4) `analyze_debug_log`**

* **in**: `{ sid:string, focus?:{ module?:string, func?:string, timeRange?:[number,number], selectedIds?:string[] }, ruleset?: "js-web-default" }`
* **out**: `{ findings:{ clusters:any[], suspects:any[], needClarify?:boolean }, links:string[] /*buglens.md*/ }`
* **逻辑（MVP 简化）**：

  * 从 `capture.ndjson` 统计：错误密集窗口、与其前后 50\~200 行附近的关联事件
  * 简单聚类：按 `module+func` 分组，找“异常上游/下游”对
  * 生成 `analysis/buglens.md`
  * 当样本不足或模块分散时 `needClarify=true`（提示用 Prompt: clarify 收敛）

---

## 3. 数据与产物规范

### 3.1 目录结构（MVP）

```
.vdt/
  sessions/
    {sid}/
      meta.json                 # repoRoot, createdAt, ttlDays, note
      logs/
        capture.ndjson
      patches/
        0001-write-log.diff
      analysis/
        buglens.md
```

### 3.2 ndjson 日志事件（最小字段）

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

> 这 6 个字段固定：`ts, level, module, func, msg, kv`。后续可扩展 `traceId, spanId, sid, captureId` 等。

### 3.3 BugLens（`analysis/buglens.md`）

```md
# BugLens v0.1

## Context
- session: {sid}
- env: node@20, macOS 14.x
- focus: {module}:{func} (optional)
- user-action: (free text)

## Symptom
- Expected: ...
- Actual: ...

## Key Logs (excerpt)
- [{module}:{func}] {msg} {kv}

## Hypotheses
1) <short title>
   - Evidence: <why>
   - Risk: <what may break>
   - Verify: <script/steps>

## Suggested Patch (high-level)
- <where & how>
```

---

## 4. 核心实现要点

### 4.1 AST 插桩（`write_log`）

* 选型：**ts-morph**（优先）或 recast + ast-types
* 策略：

  * 在函数首/关键分支前后插入 `vdtLog({ ts: Date.now(), level, module, func, msg, kv })`
  * 加注释指纹：`// VDT:log <hash>`，便于幂等检查
  * `dryRun` 生成 `diff`（使用 `git diff --no-index` 或 js diff 库），应用前让客户端确认

### 4.2 捕获（`do_capture`）

* `node-pty` 创建伪终端；`data` 事件按行缓冲
* 行解析：stdout→`level:info/debug`，stderr→`level:error`；无法解析结构化内容时也写入 `msg: raw_line`
* `redact.patterns`：正则数组，逐行替换
* 关闭时生成统计（总行数/错误行数），返回 `ResourceLink`（`logs/capture.ndjson`）

### 4.3 分析（`analyze_debug_log`）

* 读取 ndjson，构建按 `module/func` 的时间序列
* 错误密集窗口：滑动窗口统计 error 比例 & 波动峰值
* 关键提要：窗口前后 50\~200 行截断，拼装成“候选块”
* 若 `focus` 或 `selectedIds` 存在，优先过滤指定块
* 输出 `buglens.md` + `findings` 摘要（供 UI/Agent 决策）

---

## 5. 安全 & 隐私（MVP）

* `write_log` 仅作用于 `files`（且可选 `allowlist` 路径匹配），拒绝跨越工程根外写入
* `do_capture`：`env` 仅允许 `PATH`,`NODE_OPTIONS` 等 **白名单键**；其余被忽略
* 默认启用脱敏：内置几条常见令牌/邮箱/URL 正则；允许追加 `redact.patterns`
* `ttlDays` 到期后提醒清理（v0.2 再提供 `purge_session` 工具）

---

## 6. 可观测性 & 错误处理

* 服务端 `stderr` 打印 `[VDT]` 前缀的关键日志（启动、工具调用结果、异常堆栈）
* 所有工具失败时：

  * 返回 `{ isError:true, message, hint }`
  * 同时在 `meta.json.errors[]` 记录（时间、工具名、code、message）

---

## 7. 测试计划（MVP）

**A. 单元测试**

* AST 插桩：幂等 2 次调用 → `diff` 不应变化；禁止修改控制流
* ndjson 写入：多行/长行/二进制字符的鲁棒性

**B. 集成测试（仓库内样例工程）**

* `examples/gobang`：包含 `renderer.ts` 与 `gridToPixel` 小 bug
* 流程：`start_session → write_log(dryRun) → write_log(apply) → do_capture(shell: node run demo) → analyze_debug_log → 产出 buglens`
* 断言：`buglens.md` 包含 “0.5 offset” 假设

**C. 负面测试**

* `allowlist` 不匹配 → `write_log` 拒绝
* 长时间命令（超时）→ `do_capture` 正确中断并落盘 partial

---

## 8. 里程碑（建议切分）

* **v0.1（MVP）**

  * Prompts ×3；Tools ×4（session / write\_log / do\_capture / analyze）
  * ndjson & buglens & diff 产物；幂等与脱敏
  * examples/gobang 集成跑通
  * 发布 `vdt-mcp` 可执行（stdio）

* **v0.2（浏览器 & 回放）**

  * `do_capture_web`（Playwright headless，console/network/event 截获 → ndjson）
  * `test_tool`（replay.sh + 最简校验）
  * `purge_session`（清理 TTL 产物）
  * `pulse`（简易状态查询）

* **v0.3（UX & 生态）**

  * SSE/HTTP 传输（远端容器化）
  * IDE 插件（VSCode/Cursor）展示 ResourceLink、BugLens、log 预览
  * 聚类增强：按 traceId/spans（若可用）与语义相似度分组

* **v0.4（深度诊断 & 修复协作）**

  * `fix_suggest` 工具：结合 `buglens.md` + 代码上下文给出 patch 草案
  * Git 集成：临时分支 `vdt/logging/*` & PR 生成
  * 框架级测试集成（Jest/Pytest）并生成 JUnit/XML 资源

* **v1.0（稳定版）**

  * 完整权限/密钥管理与组织使用规范
  * 大规模日志的分片索引（offset-based ResourceLink）
  * 文档化 & 版本化的 DebugSpec（多语言 SDK）

---

## 9. 成功指标（建议）

* **效率**：从报 bug 到产出一个可行动的 BugLens 的中位时长（对比无 VDT）
* **准确性**：BugLens 的“首选修复假设”命中率（Top-1/Top-3）
* **可用性**：一次调试流程中的人工复制粘贴量（应显著降低）
* **复用**：BugLens 在相似问题中的复用率（引用或相似匹配命中）
* **安全**：脱敏误报/漏报比率；拒绝越权操作次数

---

## 10. 风险与对策

* **日志形状不一致** → MVP 强约束 ndjson 六字段；无法结构化时也写 `msg` 原文，分析层只用可用字段。
* **AST 插桩误伤** → 仅在锚点/函数范围内插入；加 `// VDT:` 指纹；默认 `dryRun` + diff 审核。
* **长命令/卡死** → `timeoutSec` 强制终止；返回 partial；提示缩小复现场景。
* **上下文爆炸** → 大对象一律 ResourceLink；BugLens 摘要≤固定长度，附详细链接。
* **隐私合规** → 默认开启脱敏；文档声明字段与边界；企业版再加密存储与访问审计。

---

# 发展路线（Roadmap 摘要）

1. **MVP（v0.1）**：打通“插桩—捕获—分析—BugLens”闭环。
2. **捕获增强（v0.2）**：浏览器/网络日志、命令回放测试、清理与心跳。
3. **体验生态（v0.3）**：远端部署、IDE 可视化、聚类诊断增强。
4. **修复协作（v0.4）**：自动 patch 草案、PR 集成、框架级测试。
5. **稳定与规模化（v1.0）**：权限/审计、分片索引、文档与 SDK 生态。

---

如果你愿意，我可以**直接给出 `server.ts` 的最小骨架**（含 `registerPrompt` + `registerTool` 的 TypeScript 空实现、资源落盘与 ndjson 写入器），你可以 `npm init` 后就能跑通 `vdt_start_session → do_capture → analyze` 的最小链路。
