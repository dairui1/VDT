// Gobang Game Renderer - 支持 Web 和控制台两种模式
export class GameRenderer {
  constructor(cellSize = 20) {
    this.cellSize = cellSize;
    this.boardSize = 15;
    this.webRenderer = null; // Web 渲染器引用
    this.stones = []; // 记录已放置的棋子
  }

  // 设置 Web 渲染器（从 main.js 传入）
  setWebRenderer(webRenderer) {
    this.webRenderer = webRenderer;
  }

  // Convert grid coordinates to pixel coordinates
  // BUG: Missing 0.5 offset for proper cell centering
  gridToPixel(x, y) {
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
      throw new Error(`Invalid grid coordinates: (${x}, ${y})`);
    }
    
    // This should be: (x + 0.5) * this.cellSize and (y + 0.5) * this.cellSize
    // but the 0.5 offset is missing, causing alignment issues
    const px = x * this.cellSize;
    const py = y * this.cellSize;
    
    return [px, py];
  }

  // Convert pixel coordinates to grid coordinates
  // BUG: 这里有潜在的边界计算错误
  pixelToGrid(px, py) {
    // 错误的边界处理 - 可能导致点击边界时的异常
    const x = Math.floor((px - 0.5) / this.cellSize); // 这里的 -0.5 可能导致问题
    const y = Math.floor((py - 0.5) / this.cellSize);
    
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
      return null;
    }
    
    return [x, y];
  }

  // Render a stone at given grid position
  renderStone(x, y, color = 'black') {
    try {
      // 记录棋子位置
      this.stones.push({ x, y, color });
      
      // 如果有 Web 渲染器，使用 Web 渲染
      if (this.webRenderer) {
        return this.webRenderer.renderStone(x, y, color);
      }
      
      // 否则使用控制台渲染
      const [px, py] = this.gridToPixel(x, y);
      console.log(`Rendering ${color} stone at grid (${x}, ${y}) -> pixel (${px}, ${py})`);
      
      // Simulate rendering logic for console mode
      return {
        type: 'stone',
        position: [px, py],
        color,
        size: this.cellSize * 0.8
      };
    } catch (error) {
      console.error(`Failed to render stone: ${error.message}`);
      return null;
    }
  }

  // 获取指定位置的棋子信息
  getStoneAt(x, y) {
    return this.stones.find(stone => stone.x === x && stone.y === y);
  }

  // 移除指定位置的棋子
  removeStoneAt(x, y) {
    const index = this.stones.findIndex(stone => stone.x === x && stone.y === y);
    if (index !== -1) {
      this.stones.splice(index, 1);
      return true;
    }
    return false;
  }

  // 获取所有棋子
  getAllStones() {
    return [...this.stones];
  }

  // Clear the board
  clear() {
    this.stones = [];
    console.log('Clearing board');
    
    // 如果有 Web 渲染器，重绘棋盘
    if (this.webRenderer) {
      this.webRenderer.drawBoard();
    }
  }

  // BUG: 内存泄漏问题 - 在某些情况下可能没有正确清理事件监听器
  destroy() {
    // 故意留一个潜在的内存泄漏问题
    // 应该清理 webRenderer 引用，但这里故意遗漏
    this.stones = [];
    // 遗漏: this.webRenderer = null;
  }
}