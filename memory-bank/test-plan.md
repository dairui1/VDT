# VDT MCP 测试方案

**版本**: v1.0  
**日期**: 2025年9月13日  
**目标**: 使用examples项目对VDT MCP服务器进行完整功能测试

## 1. 测试目标 🎯

### 主要目标
- 验证VDT MCP服务器的7个核心工具功能
- 测试完整的调试工作流程：捕获 → 分析 → 澄清 → 修复 → 验证 → 总结
- 验证错误检测和分析能力
- 确保MCP协议的正确实现

### 成功标准
- ✅ 所有7个工具能正常调用和执行
- ✅ 能检测出至少80%的预设错误
- ✅ 生成准确的BugLens分析报告
- ✅ 提供可行的修复建议
- ✅ 会话管理和资源访问正常

## 2. 测试环境准备 🛠️

### 2.1 服务器构建
```bash
# 项目根目录构建
cd /Users/agrimonia/playground/VDT
pnpm install
pnpm run build

# 验证构建结果
ls -la dist/
```

### 2.2 MCP服务器验证
```bash
# 测试基本连接
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"resources":{},"tools":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}' | node dist/server.js

# 列出可用工具（应返回7个工具）
echo '{"jsonrpc":"2.0","method":"tools/list","id":2}' | node dist/server.js

# 列出可用提示
echo '{"jsonrpc":"2.0","method":"prompts/list","id":3}' | node dist/server.js
```

### 2.3 示例项目准备
```bash
# Gobang项目（主要测试项目）
cd examples/gobang
pnpm install

# Snake项目（辅助测试项目）
cd ../snake
pnpm install
```

## 3. 测试用例设计 📋

### 3.1 基础功能测试

#### 测试用例T001: 工具列表验证
**目标**: 验证所有7个工具正确注册
**步骤**:
1. 调用 `tools/list`
2. 验证返回的工具列表

**预期结果**:
```json
{
  "tools": [
    {"name": "start_session"},
    {"name": "capture_run"}, 
    {"name": "analyze_capture"},
    {"name": "clarify"},
    {"name": "reasoner_run"},
    {"name": "verify_run"},
    {"name": "end_session"}
  ]
}
```

#### 测试用例T002: 提示列表验证
**目标**: 验证4个提示正确注册
**预期结果**:
- `vdt/spec/orchestration`
- `vdt/debugspec/write-log`  
- `vdt/debugspec/clarify`
- `vdt/debugspec/fix-hypothesis`

### 3.2 端到端工作流测试

#### 测试用例T101: Gobang CLI模式完整流程
**目标**: 测试CLI模式下的完整调试工作流
**步骤**:

1. **启动会话**
```json
{
  "method": "tools/call",
  "params": {
    "name": "start_session",
    "arguments": {
      "repoRoot": "./examples/gobang",
      "note": "测试五子棋渲染对齐错误",
      "ttlDays": 1
    }
  }
}
```

2. **捕获执行**
```json
{
  "method": "tools/call",
  "params": {
    "name": "capture_run", 
    "arguments": {
      "sid": "{从步骤1获取}",
      "mode": "cli",
      "shell": {
        "cwd": "./examples/gobang",
        "commands": ["pnpm run demo"],
        "timeoutSec": 30
      }
    }
  }
}
```

3. **分析捕获**
```json
{
  "method": "tools/call",
  "params": {
    "name": "analyze_capture",
    "arguments": {
      "sid": "{会话ID}",
      "focus": {
        "module": "renderer"
      }
    }
  }
}
```

4. **澄清分析（如需要）**
```json
{
  "method": "tools/call",
  "params": {
    "name": "clarify",
    "arguments": {
      "sid": "{会话ID}",
      "chunks": [/* 从analyze_capture返回 */],
      "answer": {
        "selectedIds": ["error_window_0"],
        "notes": "关注渲染对齐问题"
      }
    }
  }
}
```

5. **推理分析**
```json
{
  "method": "tools/call",
  "params": {
    "name": "reasoner_run",
    "arguments": {
      "sid": "{会话ID}",
      "task": "propose_patch",
      "inputs": {
        "buglens": "vdt://sessions/{sid}/analysis/buglens.md"
      }
    }
  }
}
```

6. **验证修复**
```json
{
  "method": "tools/call",
  "params": {
    "name": "verify_run",
    "arguments": {
      "sid": "{会话ID}",
      "commands": ["pnpm run demo"]
    }
  }
}
```

7. **结束会话**
```json
{
  "method": "tools/call",
  "params": {
    "name": "end_session",
    "arguments": {
      "sid": "{会话ID}"
    }
  }
}
```

**预期结果**:
- 每一步都成功执行，无错误
- 生成完整的会话资源文件
- BugLens报告识别出渲染对齐错误
- 推理分析提供修复建议

#### 测试用例T102: Gobang Web模式流程
**目标**: 测试Web模式下的捕获和分析
**前置条件**: `pnpm run serve` 启动Web服务器
**特殊步骤**:
```json
{
  "name": "capture_run",
  "arguments": {
    "sid": "{会话ID}",
    "mode": "web",
    "web": {
      "entryUrl": "http://localhost:8080",
      "actions": true,
      "console": true,
      "network": false
    }
  }
}
```

### 3.3 错误检测能力测试

#### 测试用例T201: 渲染对齐错误检测
**目标**: 验证能检测出`gridToPixel`函数的0.5偏移缺失
**错误位置**: `renderer.js:24-25`
**触发方式**: 运行基础Demo观察棋子位置
**预期检测**: BugLens报告中应包含坐标转换相关错误

#### 测试用例T202: 边界检查错误检测  
**目标**: 验证能检测边界条件错误
**错误位置**: `game.js:59`, `main.js:70`, `main.js:262`
**触发方式**: `pnpm run demo:edge`
**预期检测**: 识别边界检查使用错误比较运算符

#### 测试用例T203: 胜负判断错误检测
**目标**: 验证游戏逻辑错误检测
**错误位置**: `game.js:164-188`  
**触发方式**: 特定棋局序列
**预期检测**: 五子连珠判断逻辑错误

#### 测试用例T204: 异步并发错误检测
**目标**: 验证竞态条件检测
**错误位置**: `main.js:79-84`
**触发方式**: 快速连续点击
**预期检测**: 异步处理竞态条件问题

#### 测试用例T205: 内存泄漏检测
**目标**: 验证内存管理问题检测
**错误位置**: `renderer.js:104-109`, `game.js:243-249`
**触发方式**: `pnpm run demo:perf`
**预期检测**: 析构函数清理不完整

#### 测试用例T206: 数组越界错误检测
**目标**: 验证边界访问错误
**错误位置**: `main.js:262-263`
**触发方式**: 循环边界测试
**预期检测**: 循环条件使用`<=`而非`<`

### 3.4 资源管理测试

#### 测试用例T301: MCP资源列表
**目标**: 验证资源正确暴露
**步骤**:
```json
{
  "method": "resources/list",
  "params": {}
}
```
**预期结果**: 返回所有会话相关资源

#### 测试用例T302: 资源读取
**目标**: 验证资源内容访问
**步骤**:
```json
{
  "method": "resources/read",
  "params": {
    "uri": "vdt://sessions/{sid}/analysis/buglens.md"
  }
}
```

### 3.5 错误处理测试

#### 测试用例T401: 无效会话ID
**目标**: 验证错误处理机制
**步骤**: 使用不存在的会话ID调用工具
**预期结果**: 返回适当错误信息

#### 测试用例T402: 超时处理
**目标**: 验证命令超时机制
**步骤**: 设置很短的`timeoutSec`
**预期结果**: 优雅处理超时，生成部分日志

## 4. 测试执行计划 📅

### 4.1 测试阶段
1. **阶段1**: 基础功能验证（T001-T002）
2. **阶段2**: 核心工作流测试（T101-T102）  
3. **阶段3**: 错误检测能力测试（T201-T206）
4. **阶段4**: 资源管理测试（T301-T302）
5. **阶段5**: 错误处理测试（T401-T402）

### 4.2 测试工具
- **基础测试**: 命令行JSON-RPC调用
- **交互测试**: MCP Inspector (`npx @modelcontextprotocol/inspector node dist/server.js`)
- **集成测试**: AI助手（Cursor/Claude Code）直接调用

## 5. 测试数据和脚本 📊

### 5.1 自动化测试脚本

创建 `test-runner.js`:
```javascript
#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

// 测试用例定义
const testCases = [
  {
    name: "T001_工具列表验证",
    command: 'echo \'{"jsonrpc":"2.0","method":"tools/list","id":1}\' | node ../../dist/server.js',
    validator: (output) => JSON.parse(output).result.tools.length === 7
  },
  // ... 其他测试用例
];

// 执行所有测试
async function runAllTests() {
  const results = [];
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push(result);
    console.log(`${testCase.name}: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
  }
  
  // 生成测试报告
  generateReport(results);
}

runAllTests().catch(console.error);
```

### 5.2 测试数据集

创建测试配置文件 `test-config.json`:
```json
{
  "testSuites": {
    "basic": ["T001", "T002"],
    "workflow": ["T101", "T102"],
    "errorDetection": ["T201", "T202", "T203", "T204", "T205", "T206"],
    "resources": ["T301", "T302"],
    "errorHandling": ["T401", "T402"]
  },
  "expectedErrors": [
    {
      "type": "渲染对齐错误",
      "file": "renderer.js",
      "lines": "24-25",
      "description": "gridToPixel函数缺少0.5偏移"
    },
    {
      "type": "边界检查错误", 
      "files": ["game.js:59", "main.js:70", "main.js:262"],
      "description": "边界条件使用错误比较运算符"
    }
  ]
}
```

## 6. 验收标准 ✅

### 6.1 功能验收
- [ ] 7个核心工具全部正常工作
- [ ] 4个提示模板正确加载  
- [ ] MCP协议完全兼容
- [ ] 会话管理功能正常
- [ ] 资源系统正确暴露

### 6.2 性能验收
- [ ] 工具响应时间 < 5秒
- [ ] 大日志文件处理能力（>1MB）
- [ ] 并发会话支持
- [ ] 内存使用合理（< 500MB）

### 6.3 错误检测验收
- [ ] 检测准确率 ≥ 80%
- [ ] 误报率 ≤ 10%  
- [ ] 6种预设错误类型全覆盖
- [ ] BugLens报告质量高

### 6.4 用户体验验收
- [ ] 错误信息清晰易懂
- [ ] 修复建议可执行
- [ ] 资源链接正确可访问
- [ ] 会话流程符合直觉

## 7. 风险和缓解措施 ⚠️

### 7.1 技术风险
**风险**: MCP协议兼容性问题  
**缓解**: 使用官方SDK，严格遵循协议规范

**风险**: 大文件处理性能问题  
**缓解**: 实现流式处理和分页机制

### 7.2 测试风险
**风险**: 示例项目环境依赖  
**缓解**: 容器化测试环境，固定依赖版本

**风险**: 随机性错误难以重现  
**缓解**: 使用固定种子，提供重现步骤

## 8. 测试报告模板 📄

### 8.1 执行结果记录
```markdown
# VDT MCP 测试报告

**执行日期**: YYYY-MM-DD  
**测试版本**: v0.3.0  
**执行人**: [测试人员]

## 测试概要
- 总测试用例: XX
- 通过: XX ✅
- 失败: XX ❌  
- 跳过: XX ⏭️

## 详细结果
### 基础功能测试
- [T001] 工具列表验证: ✅ PASS
- [T002] 提示列表验证: ✅ PASS

### 工作流测试  
- [T101] Gobang CLI完整流程: ✅ PASS
- [T102] Gobang Web模式: ❌ FAIL - 原因...

[继续记录所有测试结果...]

## 问题总结
1. **关键问题**: [描述]
2. **一般问题**: [描述]  
3. **改进建议**: [描述]

## 结论
[整体评估和建议]
```

## 9. 后续改进计划 🚀

### 9.1 短期改进（1周内）
- 修复发现的关键错误
- 完善错误处理机制
- 优化性能瓶颈

### 9.2 中期改进（1个月内）
- 增加更多测试场景
- 实现自动化测试流水线
- 添加性能基准测试

### 9.3 长期规划（3个月内）
- 集成CI/CD流水线
- 添加压力测试
- 实现测试覆盖率统计

---

**备注**: 本测试方案是活文档，随着VDT功能演进而持续更新。每次重大更新后都应重新执行完整测试套件。
