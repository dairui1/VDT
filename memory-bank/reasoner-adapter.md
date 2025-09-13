# 方案总览：Reasoner Adapter（可插拔推理层）

**目标**：把“需要 LLM 思考的步骤”（日志语义聚合、假设生成、补丁建议、代码审阅）从 VDT 抽离，定义统一协议与任务模型，底层以“驱动（driver）”接多种 LLM 后端。

* 上层：**VDT MCP**（工程动作 + 资源产物）
* 中间：**Reasoner Adapter**（统一接口 + 后端路由）
* 后端：`codex`（gpt-5）、`gemini-cli`、`openai`、`openrouter` …（可并存）

可以有两种部署：

1. **独立 MCP**：暴露工具 `reasoner_analyze_log`、`reasoner_propose_patch`、`reasoner_review_patch`，由 Claude 统一调度（推荐）。
2. **本地子进程/HTTP**：VDT 通过本地进程或 HTTP 调用 Reasoner Adapter（MVP 也行，但与“VDT 不内嵌 LLM”的哲学稍背离）。

---

# 统一任务模型（输入/输出规范）

## 输入（ReasonerTask）

```json
{
  "task": "analyze_log | propose_patch | review_patch",
  "sid": "session-id",
  "inputs": {
    "logs": ["vdt://sessions/{sid}/logs/capture.ndjson"],
    "buglens": "vdt://sessions/{sid}/analysis/buglens.md",
    "code": ["file://src/renderer.ts", "file://src/board.ts"],
    "diff": "vdt://sessions/{sid}/patches/0001-write-log.diff"
  },
  "question": "optional freeform question",
  "constraints": ["minimal change", "no behavior change unless justified"],
  "model_prefs": {
    "effort": "low|medium|high",
    "max_tokens": 4000,
    "temperature": 0.2
  },
  "redact": true
}
```

## 输出（ReasonerResult）

```json
{
  "insights": [
    { "title": "Off-by-0.5 in gridToPixel", "evidence": ["logs:123-140"], "confidence": 0.82 }
  ],
  "suspects": [
    { "file": "src/renderer.ts", "lines": [45, 70], "rationale": "mapping function + log correlation" }
  ],
  "patch_suggestion": "diff --git a/src/renderer.ts ...",  // 仅当 task=propose_patch
  "next_steps": ["add log at board.applyMove", "reproduce after patch"],
  "notes": "short natural language summary"
}
```

> 这两个 JSON 结构是**跨后端稳定**的“契约”，前后端都按它来对接。

---

# 驱动（Driver）设计

每个后端做一个 **driver**，负责把 ReasonerTask → 具体 CLI/API 调用 → 归一化 ReasonerResult。

* `drivers/codex.ts`

  * 走 **codex MCP** 或 codex CLI（stdio），比如：

    ```bash
    codex -m gpt-5 -c model_reasoning_effort=high mcp
    ```
  * 发送构造好的 prompt（把 ResourceLink 内容按需载入/抽取摘要），收 JSON。

* `drivers/gemini.ts`

  * 走 `gemini-cli`（非交互），传同样的 prompt/附件，解析 JSON。

* `drivers/openai.ts` / `drivers/openrouter.ts`

  * 走 HTTP（OpenAI/OpenRouter Chat Completions），同样拼 prompt + tools/JSON 模式约束。

**统一要求**

* **超时**：默认 60–120s；
* **重试**：指数回退 2 次；
* **降级**：失败后可切备选模型（如从 high→medium effort）；
* **输出校验**：严格 JSON schema 校验（不合格则要求模型“仅返回 JSON”再试一次）；
* **脱敏**：传给模型前的文本走统一 `redact()`。

---

# 路由策略（选哪个后端）

**静态配置** + **动态打分**二合一：

* 静态：在配置中指定“默认后端/模型偏好”，以及“某类任务固定走某后端”（例如 `propose_patch → gpt-5`）。
* 动态：根据 VDT 提供的信号计算 `reason_score`（与之前的 `codex_score` 类似），超过阈值则用高阶模型；否则走便宜模型。

  ```txt
  reason_score = 0.25*error_density
               + 0.20*stacktrace_novelty
               + 0.15*context_span
               + 0.15*churn_score
               + 0.10*repeat_failures
               + 0.10*entropy_logs
               + 0.05*spec_mismatch
  # >= 0.55 → 选“高级后端”（如 gpt-5 high effort）
  ```

---

# 配置文件（示例）

`.vdt/reasoners.yaml`

```yaml
default_backend: codex
fallback_backend: openrouter

backends:
  codex:
    type: mcp       # 也可 cli/http
    cmd: "codex"
    args: ["-m", "gpt-5", "-c", "model_reasoning_effort=high", "mcp"]
    cost_hint: high
    supports:
      - analyze_log
      - propose_patch
      - review_patch

  gemini:
    type: cli
    cmd: "gemini"
    args: ["chat", "--json"]   # 具体参数以你本地 CLI 为准
    cost_hint: medium

  openai:
    type: http
    base_url: "https://api.openai.com/v1"
    model: "gpt-4.1-mini"
    api_key_env: "OPENAI_API_KEY"
    cost_hint: low

  openrouter:
    type: http
    base_url: "https://openrouter.ai/api/v1"
    model: "meta-llama/llama-3.1-70b-instruct"
    api_key_env: "OPENROUTER_API_KEY"
    cost_hint: medium

routing:
  propose_patch: codex
  review_patch:  codex
  analyze_log:   auto          # 用 reason_score 自动挑
thresholds:
  reason_score_advanced: 0.55
timeouts:
  default_sec: 90
  analyze_sec: 120
  patch_sec: 120
```

---

# MCP 工具面（如果把 Reasoner Adapter 做成独立 MCP）

* `reasoner_analyze_log`
  **in**: `ReasonerTask`（task=analyze\_log）
  **out**: `ReasonerResult`

* `reasoner_propose_patch`
  **in**: `ReasonerTask`（task=propose\_patch）
  **out**: `ReasonerResult`（含 `patch_suggestion`）

* `reasoner_review_patch`
  **in**: `ReasonerTask`（task=review\_patch，含 diff 与目标约束）
  **out**: `ReasonerResult`（指出风险/回归点/额外测试）

> 这样 Claude 侧就能像调用 VDT 一样，调用 Reasoner MCP；后端随时可换。

---

# 与 Codex 的接线（实操）

## 方式 A：在 Claude 中添加 Codex MCP（最少改造）

在本地安装好 codex CLI 后，执行：

```bash
claude mcp add codex -s user -- codex -m gpt-5 -c model_reasoning_effort=high mcp
```

然后在对话里直接使用 `vdt/debugspec/*` 的 Prompts 或把 `buglens.md`/日志片段贴给 codex 进行分析（注意输出 JSON 约束）。

优点：无需实现 Reasoner Adapter；缺点：缺少统一 JSON 校验/重试/路由，需要在 Prompt 中自行声明。

## 方式 B：非交互 CLI（codex exec）

示例：把会话产物作为输入，离线产出 JSON 文件，供 IDE/VDT 消费。

```bash
codex -m gpt-5 -c model_reasoning_effort=high exec <<'EOF' > .vdt/sessions/<sid>/analysis/reasoner_analyze.json
System: You are a code reasoning specialist. Output ONLY JSON per the schema.
User:
  Task: analyze_log
  Session: <sid>
  Artifacts:
    - logs: .vdt/sessions/<sid>/logs/capture.ndjson
    - buglens: .vdt/sessions/<sid>/analysis/buglens.md
  Schema:
    {"insights":[],"suspects":[],"next_steps":[],"notes":""}
  Guardrails: No non-JSON text.
EOF
```

建议：生产环境仍用 Reasoner Adapter 包装 codex，统一脱敏、JSON 校验、超时/重试、成本守门与路由。

---

# Prompt 规范（驱动共享的模板）

所有驱动共用一套**短而刚性**的系统+用户模板（保证跨模型稳定）：

**System（固定）**

* “You are a code reasoning specialist. Output **only JSON** conforming to the provided schema. If unsure, include low confidence.”
* “Prefer minimal, auditable conclusions with explicit evidence (log line ranges or file spans).”

**User（按任务拼装）**

* `Context`: session, env（可选）、限制
* `Artifacts`: 摘要（ResourceLink 内容做摘要/抽样，避免超长）
* `Schema`: 明确 JSON 字段与类型
* `Task`: 针对 task（analyze/propose/review）的 3–5 条明确指令
* `Guardrails`: “No source code changes unless propose\_patch task”, “Never output non-JSON text”, …

> 关键：**先做日志/代码的“摘要器”**，把超长资源缩成精要片段，极大提高跨模型稳定性与成本可控。

---

# 失败与回退策略

* **JSON 校验失败**：自动补发“仅返回 JSON”提示，再试一次；仍失败 → 切换后端或降低温度。
* **超时**：按 `timeouts.*` 中断，返回 `partial` 标记；Claude 可决定是否重试。
* **成本守门**：累计 token 超过阈值 → 强制改走便宜模型或缩小上下文（仅最新窗口）。
* **敏感泄露**：启用 `redact`；若发现敏感片段仍外泄，记录审计并中止该后端。

---

# 与 VDT 的衔接（端到端）

1. VDT 产出资源：`capture.ndjson`、`buglens.md`、`patch.diff`（可选）。
2. Claude 根据启发式计算 `reason_score` → 选后端（或交给 Reasoner Adapter 自动路由）。
3. 调用 `reasoner_*` 工具，传 `sid + ResourceLink`。
4. Reasoner 返回 `insights/suspects/patch_suggestion`。
5. Claude 再调 VDT 执行验证（回放/测试），或发起 PR。

---

# 落地顺序（建议）

* **Sprint 1**：

  * 定义 ReasonerTask/Result JSON schema；
  * 实现 `Reasoner Adapter` 的 CLI 框架与 **openai**（HTTP）/ **codex**（MCP）两个 driver；
  * 接 v0.1 的 VDT（只做 analyze\_log → insights）。

* **Sprint 2**：

  * 加 `propose_patch`、`review_patch`；
  * 加 `gemini-cli` / `openrouter` driver；
  * 上线路由与超时/重试/降级。

* **Sprint 3**：

  * 做“摘要器”与语义切片（长日志→窗口）；
  * 成本/质量监控（信号 + A/B 对比不同后端）。

---

**一句话**：
把“思考”抽象成 **Reasoner Adapter**，用统一 JSON 契约 + 驱动层适配不同 LLM 后端；VDT 专注工程产物与执行，Claude 负责编排。这样你既能用 codex，也能**随时切 gemini/openai/openrouter**，体验与成本都可控。
