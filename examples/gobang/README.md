# Gobang Demo Project

这是一个完整的五子棋游戏实现，专门设计用于展示 VDT 调试工具的能力。游戏包含多个预设的错误和边界情况，用于测试调试功能。

## 功能特色

### 🎮 完整的游戏功能
- **网页版游戏**: 使用 Canvas 绘制的美观界面
- **鼠标交互**: 点击棋盘放置棋子
- **游戏控制**: 重新开始、悔棋、自动对局
- **实时调试**: 内置调试日志面板
- **控制台版本**: 支持纯命令行游戏

### 🐛 预设调试错误
项目故意包含以下类型的错误，用于测试 VDT 工具的调试能力：

#### 1. 渲染对齐错误
- **位置**: `renderer.js:24-25`
- **错误**: `gridToPixel` 函数缺少 0.5 偏移
- **影响**: 棋子不能正确居中显示
- **症状**: 视觉对齐问题

#### 2. 边界检查错误
- **位置**: `game.js:59`, `main.js:70`, `main.js:262`
- **错误**: 边界条件使用了错误的比较运算符
- **影响**: 允许在边界外放置棋子或数组越界
- **症状**: 运行时错误或意外行为

#### 3. 胜负判断错误
- **位置**: `game.js:164-188`
- **错误**: 边界情况下的五子连珠检测可能出错
- **影响**: 在某些特定情况下可能误判胜负
- **症状**: 游戏逻辑错误

#### 4. 异步并发错误
- **位置**: `main.js:79-84`
- **错误**: 点击事件使用了异步处理，可能导致竞态条件
- **影响**: 快速点击时可能导致状态不一致
- **症状**: 间歇性错误

#### 5. 内存泄漏问题
- **位置**: `renderer.js:104-109`, `game.js:243-249`
- **错误**: 析构函数没有正确清理所有引用
- **影响**: 长期运行可能导致内存泄漏
- **症状**: 内存使用持续增长

#### 6. 数组越界错误
- **位置**: `main.js:262-263`
- **错误**: 循环条件使用了 `<=` 而非 `<`
- **影响**: 访问不存在的数组元素
- **症状**: 潜在的运行时错误

## 安装和运行

### 前置要求
- Node.js 16+
- 现代浏览器（支持 ES6+ 和 Canvas）

### 安装依赖
```bash
cd examples/gobang
npm install
```

### 运行方式

#### 🌐 网页版游戏
```bash
# 启动静态服务器并在浏览器中打开
npm run dev

# 或者手动启动服务器
npm run serve
```

然后在浏览器中访问 `http://localhost:8080`

#### 🖥️ 控制台版本
```bash
# 基础控制台游戏
npm start

# 完整演示（包含错误触发）
npm run demo

# 自动对局演示
npm run demo:auto

# 边界情况测试
npm run demo:edge

# 性能测试
npm run demo:perf

# 运行所有测试
npm test
```

## VDT 调试工具测试流程

### 🎯 基础调试测试

#### 1. 启动 VDT 会话
```javascript
start_session({
  repoRoot: './examples/gobang',
  note: 'Testing gobang rendering and game logic bugs'
})
```

#### 2. 添加日志记录
```javascript
write_log({
  sid: '<session-id>',
  files: ['renderer.js', 'game.js', 'main.js'],
  anchors: ['gridToPixel', 'placeStone', 'handleCanvasClick'],
  level: 'debug'
})
```

#### 3. 捕获执行过程
```javascript
// 控制台版本调试
do_capture({
  sid: '<session-id>',
  shell: {
    cwd: './examples/gobang',
    commands: ['npm run demo']
  }
})

// Web 版本调试
do_capture({
  sid: '<session-id>',
  shell: {
    cwd: './examples/gobang',
    commands: ['npm run serve']
  },
  browser: {
    url: 'http://localhost:8080',
    actions: [
      { type: 'click', selector: 'canvas', x: 300, y: 300 },
      { type: 'click', selector: '#btn-auto' },
      { type: 'wait', duration: 5000 }
    ]
  }
})
```

#### 4. 分析调试结果
```javascript
analyze_debug_log({
  sid: '<session-id>',
  focus: {
    module: 'renderer',
    func: 'gridToPixel',
    issue: 'alignment'
  }
})
```

### 🔍 高级调试场景

#### 场景 1: 渲染对齐问题
**目标**: 发现 `gridToPixel` 函数中缺少的 0.5 偏移

1. 运行 Web 版本并点击棋盘
2. 观察棋子是否正确居中
3. 检查 `renderer.js:24-25` 的坐标计算

**预期结果**: VDT 应该识别出坐标计算中的偏移问题

#### 场景 2: 边界检查漏洞
**目标**: 发现边界检查中的逻辑错误

1. 尝试在棋盘边缘点击
2. 运行边界测试: `npm run demo:edge`
3. 观察是否允许在 (15,15) 位置落子

**预期结果**: VDT 应该发现边界检查使用了错误的比较运算符

#### 场景 3: 胜负判断错误
**目标**: 在特定情况下触发胜负判断错误

1. 在棋盘边缘形成五子连珠
2. 观察游戏是否正确识别获胜
3. 检查 `checkWin` 函数的边界处理

**预期结果**: VDT 应该发现胜负判断在边界情况下的计算问题

#### 场景 4: 并发问题
**目标**: 触发异步点击导致的竞态条件

1. 快速连续点击棋盘多个位置
2. 观察是否出现状态不一致
3. 检查 `handleCanvasClick` 中的异步处理

**预期结果**: VDT 应该识别出异步操作可能导致的并发问题

#### 场景 5: 内存泄漏检测
**目标**: 发现析构函数中的内存泄漏

1. 多次重启游戏: `npm run demo:perf`
2. 监控内存使用情况
3. 检查 `destroy` 方法的清理逻辑

**预期结果**: VDT 应该发现未正确清理的对象引用

### 📊 测试用例总结

| 错误类型 | 文件位置 | 触发方法 | 难度等级 |
|---------|---------|---------|---------|
| 渲染对齐 | renderer.js:24 | 点击棋盘 | ⭐ 简单 |
| 边界检查 | game.js:59 | 边界点击 | ⭐⭐ 中等 |
| 胜负判断 | game.js:164 | 边缘获胜 | ⭐⭐⭐ 困难 |
| 异步并发 | main.js:79 | 快速点击 | ⭐⭐⭐ 困难 |
| 内存泄漏 | multiple | 重复操作 | ⭐⭐⭐⭐ 很难 |
| 数组越界 | main.js:262 | 自动对局 | ⭐⭐ 中等 |

### 🎖️ 成功标准

VDT 工具成功测试的标准：

1. **发现率**: 能识别出至少 80% 的预设错误
2. **准确性**: 错误定位精确到具体代码行
3. **分析深度**: 能解释错误的根本原因和影响
4. **修复建议**: 提供具体的修复方案
5. **性能**: 调试过程不显著影响应用性能

### 📝 测试报告模板

使用以下模板记录测试结果：

```markdown
## VDT 测试报告 - Gobang Demo

### 测试环境
- VDT 版本: X.X.X
- Node.js 版本: X.X.X
- 浏览器: Chrome/Firefox/Safari
- 操作系统: macOS/Windows/Linux

### 发现的错误
1. **渲染对齐问题** ✅/❌
   - 位置: renderer.js:24
   - 描述: [VDT分析结果]
   - 修复建议: [VDT建议]

2. **边界检查错误** ✅/❌
   - 位置: game.js:59
   - 描述: [VDT分析结果]
   - 修复建议: [VDT建议]

[继续记录其他错误...]

### 总体评分
- 发现率: X/6 (X%)
- 分析准确性: ⭐⭐⭐⭐⭐
- 修复建议质量: ⭐⭐⭐⭐⭐
- 性能影响: 低/中/高

### 改进建议
[对VDT工具的改进建议]
```

## 开发说明

### 项目结构
```
gobang/
├── index.html          # Web版本主页面
├── style.css           # 样式文件
├── main.js             # Web版本主逻辑
├── game.js             # 游戏核心逻辑
├── renderer.js         # 渲染器（支持Web/控制台）
├── demo.js             # 演示和测试脚本
├── index.js            # 控制台版本入口
├── package.json        # 项目配置
└── README.md           # 本文件
```

### 添加新的测试错误

要添加新的测试错误：

1. 在相应文件中添加注释标记错误位置
2. 确保错误是隐蔽但可检测的
3. 在 `demo.js` 中添加触发该错误的测试用例
4. 更新本 README 文件的错误列表
5. 添加相应的 VDT 测试场景

### 贡献指南

欢迎贡献更多的测试用例和错误场景：

1. Fork 项目
2. 创建功能分支
3. 添加新的错误或测试场景
4. 确保所有现有测试仍然有效
5. 更新文档
6. 提交 Pull Request

## 许可证

MIT License - 详见 LICENSE 文件