# VDT —— The Vibe Debugging Tool

## 项目简介

VDT 是一个面向 LLM 辅助编程（Vibe Coding）的调试工具链。
核心目标是 **把 80% 的调试精力降维处理**：通过自动化日志收集、过滤、澄清、分析和测试，帮助开发者与主 Agent 高效协作，快速定位并解决 Bug。

**VDT means Vibe Debugging Tool**

**VDT also means Verify · Diagnose · Test**

## 背景与痛点

1. 在 Vibe Coding 的实际流程里，**20% 精力用于生成，80% 精力用于调试**。
2. 调试 LLM 辅助代码的时间往往 **不低于手写代码的调试成本**，甚至更高，原因是：

   * 代码往往缺少上下文一致性；
   * 日志环境混乱（浏览器、Node、bash、后端等多重输出）；
   * 用户需要手动复制粘贴上下文，打断注意力流；
   * 难以沉淀可复用的 Debug 知识。

## 概念与价值

* **用户动作**：提出 Bug + 请求修复
* **VDT 动作**：收集 → 澄清 → 分析 → 生成 BugLens → 修复建议
* **价值**：

  * 降低用户的上下文搬运负担
  * 提供结构化的 Debug 过程文档（BugLens）
  * 支持多轮 Codex 调整（-p/-r 模式）
  * 可插拔，不侵入原项目

## 系统架构

### 1. 角色与接口

- 主 Agent：默认 Claude Code（推理与决策）
- 协作 Agent：Codex（补丁、测试与回放执行）
- VDT MCP Server：提供最小工具集合，通过 MCP 暴露资源与能力
- 资源化约定：`vdt://sessions/{sid}/...` 映射 `.vdt/sessions/{sid}`，客户端用 MCP `list_resources/read_resource` 获取上下文

### 2. 核心节点（KISS v0.3）

1. **start_session**：初始化会话，返回 `{ sid, spec, links }` 与最小 system_reminder
2. **capture_run**：统一捕获（CLI/Web），输出 `logs/capture.ndjson`（Web 可附 `actions/console/network.ndjson`）
3. **analyze_capture**：生成 `analysis/buglens.md`，返回 `candidateChunks` 与 `needClarify`
4. **clarify（可选）**：记录用户对候选块的选择与备注到 `analysis/clarify.md`
5. **reasoner_run**：Claude Code 产出修复方案与验证步骤，Codex 协作生成补丁并准备回放
6. **replay_run**：执行验证/回放并采集结果
7. **end_session**：输出 `analysis/summary.md`（结论 + 证据 + 下一步）

附：**write_log/apply_write_log（可选）**——仅在信号严重不足时最小化插桩，默认不进入闭环

---

## 工具与动作

| Tool                | 描述                     | 输入                                 | 输出                                  |
| ------------------- | ---------------------- | ------------------------------------ | ------------------------------------- |
| `start_session`     | 初始化会话与资源约定           | 可选配置                              | `{ sid, spec, links }`                |
| `capture_run`       | 统一捕获 CLI/Web 日志       | `{ mode:'cli'|'web', ... }`          | `logs/capture.ndjson`（附 Web 流）        |
| `analyze_capture`   | 读取 ndjson 并生成 BugLens | capture.ndjson + clarify.md（可选）   | `analysis/buglens.md` + 候选块/needClarify |
| `clarify`（可选）    | 记录用户选择与备注            | 候选块 + `{ selectedIds, notes? }`    | `{ selectedIds }` + `analysis/clarify.md` |
| `reasoner_run`      | 产出补丁与验证步骤            | BugLens + 代码上下文                   | 补丁 diff + 验证脚本/命令                  |
| `replay_run`        | 执行验证/回放               | 验证脚本/命令                          | 回放日志/快照 + 通过/失败                   |
| `end_session`       | 输出总结                   | 会话产物                              | `analysis/summary.md`                  |

附：`write_log`/`apply_write_log` 为扩展工具，默认关闭，仅在必要时启用

---

## 优势

* **最小闭环**：捕获 → 分析/澄清 → 修复/回放 → 总结
* **资源化上下文**：通过 MCP 以 `vdt://sessions/{sid}/...` 暴露产物，零粘贴
* **非侵入式优先**：默认不插桩；必要时最小化 `write_log`
* **知识沉淀**：输出结构化 BugLens 与 summary，便于复用

---

## 流程示例

**场景：用户五子棋落子显示错误**

1. 用户：

   > "@VDT，我的五子棋棋子现在落到格子中间了，应该落到线上"

2. VDT:

   * `capture_run` → 用户复现落子动作，收集 ndjson 日志
   * `analyze_capture` → 生成 `buglens.md`，识别坐标换算嫌疑并标记 `needClarify`
   * `clarify`（可选）→ 展示候选块，用户选择“棋盘坐标换算”相关块
   * `reasoner_run('propose_patch')` → Claude Code 提出修复 + Codex 生成补丁
   * `replay_run` → 回放验证通过；若失败则回到 capture/clarify 继续收敛
   * `end_session` → 输出 `summary.md`（结论与回归步骤）

---

## BugLens 格式

```md
# BugLens Report

## Context
- 文件: src/board/renderer.ts
- 用户动作: 落子到 (x=4, y=3)

## Key Logs

[Renderer] input=grid(4,3)  
[Renderer] mapped to pixel=(85, 75)  
[Renderer] piece.draw @ (85,75)

## Problem

* 棋子应该落在棋盘线交点，但实际落在格子中心

## Hypothesis

* 坐标换算函数缺少 0.5 偏移

## Suggested Fix

* 修改 `gridToPixel(x,y)` → `return ((x+0.5)*cellSize, (y+0.5)*cellSize)`
```

## 开发参考  

- **项目模板**：  
  https://github.com/modelcontextprotocol/servers/tree/main/src/everything  

- **TypeScript SDK**：  
  https://www.npmjs.com/package/@modelcontextprotocol/sdk  

- **Debug MCP Prototype**：  
  https://deepwiki.com/snagasuri/deebo-prototype  

- **Vibedev Specs MCP**：  
  https://github.com/yinwm/vibedevtools/blob/main/vibedev-specs-mcp/src/server.ts  

## 后续扩展  
- **CR 集成**：结合 Git 信息和 codeQA → 自动回溯变更原因  
- **多轮 Codex 调整**：codex -p/-r 模式自动对话  
- **跨环境兼容**：前端 Console、Node.js、Bash 统一接入  
- **智能优先级**：VDT 根据日志特征自动推荐需要澄清的日志块  

要不要我帮你把这个文档转成 **更正式的 README 模板**（比如 `README.md`，带上安装/使用/示例），还是先保留成内部的 **项目设计 spec** 格式呢？
