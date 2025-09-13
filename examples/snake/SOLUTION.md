# Snake 游戏调试练习 - 解决方案 (HTML 版本)

## Bug #1: 边界检查错误

### 问题代码
```javascript
// 错误：允许蛇越界一格
if (head.x < -1 || head.x > this.width || head.y < -1 || head.y > this.height) {
    this.gameOver = true;
    return;
}
```

### 正确代码
```javascript
// 修复：正确的边界检查
if (head.x < 0 || head.x >= this.width || head.y < 0 || head.y >= this.height) {
    this.gameOver = true;
    return;
}
```

### 修复位置
1. `game.js` 第47行 - `move()` 方法
2. `game.js` 第104行 - `getValidMoves()` 方法

### 解释
- `head.x >= this.width` 而不是 `head.x > this.width`，因为有效索引范围是 0 到 width-1
- `head.y >= this.height` 而不是 `head.y > this.height`，同样的原因

## Bug #2: 食物生成错误

### 问题代码
```javascript
generateFood() {
    // BUG: 没有检查食物是否生成在蛇身上
    let food = {
        x: Math.floor(Math.random() * this.width),
        y: Math.floor(Math.random() * this.height)
    };
    return food;
}
```

### 正确代码
```javascript
generateFood() {
    let food;
    do {
        food = {
            x: Math.floor(Math.random() * this.width),
            y: Math.floor(Math.random() * this.height)
        };
    } while (this.snake.some(segment => segment.x === food.x && segment.y === food.y));
    return food;
}
```

### 修复位置
`game.js` 第17-24行 - `generateFood()` 方法

### 解释
使用 do-while 循环确保食物不会生成在蛇身体的任何部位上。

## Bug #3: 计分和成长逻辑错误

### 问题代码
```javascript
// Check food collision
if (head.x === this.food.x && head.y === this.food.y) {
    // BUG: 分数增长异常且蛇不会成长
    this.score += this.snake.length; // 错误：应该是固定分数
    this.snake.pop(); // 错误：吃到食物时不应该移除尾部
    this.food = this.generateFood();
} else {
    this.snake.pop();
}
```

### 正确代码
```javascript
// Check food collision
if (head.x === this.food.x && head.y === this.food.y) {
    this.score += 10; // 固定增加10分
    this.food = this.generateFood(); // 生成新食物
    // 注意：不调用 this.snake.pop()，让蛇变长
} else {
    this.snake.pop(); // 只有没吃到食物时才移除尾部
}
```

### 修复位置
`game.js` 第59-66行 - `move()` 方法中的食物碰撞处理部分

### 解释
- 吃到食物时应该获得固定分数（10分），而不是基于蛇长度的变动分数
- 吃到食物时不应该调用 `this.snake.pop()`，这样蛇身体才能增长
- 只有在没有吃到食物的情况下才移除尾部，维持蛇的长度

## 完整的修复后代码片段

### game.js 关键部分修复

```javascript
// 修复后的 generateFood 方法
generateFood() {
    let food;
    do {
        food = {
            x: Math.floor(Math.random() * this.width),
            y: Math.floor(Math.random() * this.height)
        };
    } while (this.snake.some(segment => segment.x === food.x && segment.y === food.y));
    return food;
}

// 修复后的 move 方法中的边界检查
// Check wall collision
if (head.x < 0 || head.x >= this.width || head.y < 0 || head.y >= this.height) {
    this.gameOver = true;
    return;
}

// 修复后的食物碰撞逻辑
// Check food collision
if (head.x === this.food.x && head.y === this.food.y) {
    this.score += 10;
    this.food = this.generateFood();
} else {
    this.snake.pop();
}

// 修复后的 getValidMoves 方法中的边界检查
// Check boundaries
if (newHead.x < 0 || newHead.x >= this.width || newHead.y < 0 || newHead.y >= this.height) {
    return false;
}
```

## 测试验证

修复后，可以通过以下方式验证：

1. **边界测试**: 让蛇碰到边界，应该立即死亡
2. **食物生成测试**: 观察食物是否总是生成在空白区域
3. **成长测试**: 吃到食物后，检查蛇是否变长一节
4. **计分测试**: 每吃一个食物应该得到exactly 10分

## 教学要点

这些 bug 展示了几个重要的编程概念：
1. **边界条件**: 正确处理数组/网格的边界
2. **循环逻辑**: 使用循环确保条件满足
3. **状态管理**: 正确管理游戏对象的状态变化
4. **逻辑分支**: if-else 语句中的正确逻辑流程
