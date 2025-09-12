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

### 1. VDT MCP Server

* 提供一组工具（tools）供主 Agent 调用
* Spec 模式统一约束：每个 tool 的输入输出有严格格式
* 工具链串起来形成调试管道

### 2. 核心节点

1. **write_log**

   * 主 Agent 在代码中插入日志（受约束的方式+格式）
2. **do_capture**

   * 用户复现场景
   * 捕获 console/bash/前端日志，生成 debug input
3. **analyze_debug_log**

   * 读取日志 + 初始文档
   * 分析问题，必要时调用 clarify_tool
4. **clarify_tool**

   * 交互式日志澄清：分组展示问题日志，请用户选择重点
   * 输出用户澄清后的 BugLens 信息
5. **test_tool**

   * 自动生成或运行测试脚本，复现/验证修复结果

---

## 工具与动作

| Tool                    | 描述            | 输入                     | 输出                     |
| ----------------------- | ------------- | ---------------------- | ---------------------- |
| **write_log**          | 主 Agent 添加日志  | 代码片段 + 规则              | 增强后的代码                 |
| **do_capture**         | 用户复现场景，收集日志   | 用户操作 + 环境              | debug_input（log dump） |
| **analyze_debug_log** | 阅读日志并生成分析     | dump_log + context.md | bug report / 修复思路      |
| **clarify_tool**       | 分块澄清日志，用户选择重点 | 日志块 + 引导问题             | 用户选择 + buglens.md      |
| **test_tool**          | 快速生成/运行测试     | 代码路径                   | 测试脚本+结果                |

---

## 优势

* **自动化串联调试环节**：收集 → 分析 → 澄清 → 修复 → 验证
* **非侵入式**：所有日志与配置保存在 `.vdt` 目录中，随时清理
* **知识沉淀**：调试过程输出 BugLens 文档，可作为未来类似问题的参考
* **上下文最小化**：用户不需要手动复制粘贴大段日志，VDT 自动抽取

---

## 流程示例

**场景：用户五子棋落子显示错误**

1. 用户：

   > "@VDT，我的五子棋棋子现在落到格子中间了，应该落到线上"

2. VDT:

   * `write_log` → 主 Agent 在棋子渲染函数中加日志
   * `do_capture` → 用户复现落子动作，日志被收集
   * `analyze_debug_log` → VDT 分析坐标换算错误
   * `clarify_tool` → 展现 3 段可能相关的日志，用户选择“棋盘坐标换算”相关块
   * `buglens.md` → 生成调试文档，指出 scale/offset 算法问题
   * 主 Agent 修复代码

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
