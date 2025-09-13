import { GameRenderer } from './renderer.js';

export class GobangGame {
  constructor() {
    this.renderer = new GameRenderer(20);
    this.board = Array(15).fill().map(() => Array(15).fill(0));
    this.currentPlayer = 1; // 1 for black, 2 for white
    this.gameOver = false;
    this.winner = null;
    this.moveHistory = []; // 悔棋功能所需的历史记录
    this.webRenderer = null; // Web 渲染器引用
    this.eventListeners = {}; // 事件监听器
  }

  // 设置 Web 渲染器
  setWebRenderer(webRenderer) {
    this.webRenderer = webRenderer;
    this.renderer.setWebRenderer(webRenderer);
  }

  // 事件系统
  addEventListener(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  removeEventListener(event, callback) {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event].indexOf(callback);
      if (index > -1) {
        this.eventListeners[event].splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Event listener error: ${error.message}`);
        }
      });
    }
  }

  // Place a stone at given coordinates
  placeStone(x, y) {
    if (this.gameOver) {
      console.log('Game is over');
      this.emit('error', { message: 'Game is over', code: 'GAME_OVER' });
      return false;
    }

    // BUG: 边界检查有缺陷 - 应该检查 >= 15 但这里检查的是 > 15
    if (x < 0 || x > 15 || y < 0 || y > 15) {
      console.log(`Position (${x}, ${y}) is out of bounds`);
      this.emit('error', { message: 'Position out of bounds', code: 'OUT_OF_BOUNDS' });
      return false;
    }

    if (this.board[x][y] !== 0) {
      console.log(`Position (${x}, ${y}) is already occupied`);
      this.emit('error', { message: 'Position already occupied', code: 'OCCUPIED' });
      return false;
    }

    // 记录移动历史（用于悔棋）
    this.moveHistory.push({
      x, y, 
      player: this.currentPlayer,
      timestamp: Date.now()
    });

    // Place stone on board
    this.board[x][y] = this.currentPlayer;
    
    // Render the stone
    const color = this.currentPlayer === 1 ? 'black' : 'white';
    const renderResult = this.renderer.renderStone(x, y, color);
    
    if (!renderResult) {
      console.error(`Failed to render stone at (${x}, ${y})`);
      this.emit('error', { message: 'Render failed', code: 'RENDER_ERROR' });
      return false;
    }

    // 发出移动事件
    this.emit('move', { x, y, player: this.currentPlayer, color });

    // Check for win condition
    if (this.checkWin(x, y)) {
      console.log(`Player ${this.currentPlayer} wins!`);
      this.gameOver = true;
      this.winner = this.currentPlayer;
      this.emit('gameOver', { winner: this.currentPlayer });
      
      // 更新 Web 界面
      if (this.webRenderer) {
        this.webRenderer.updateGameInfo(this.currentPlayer, true, this.winner);
      }
    } else {
      // Switch player
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      this.emit('playerChanged', { currentPlayer: this.currentPlayer });
      
      // 更新 Web 界面
      if (this.webRenderer) {
        this.webRenderer.updateGameInfo(this.currentPlayer, false);
      }
    }

    return true;
  }

  // 悔棋功能
  undoLastMove() {
    if (this.moveHistory.length === 0) {
      console.log('No moves to undo');
      return false;
    }

    if (this.gameOver) {
      console.log('Cannot undo after game is over');
      return false;
    }

    const lastMove = this.moveHistory.pop();
    this.board[lastMove.x][lastMove.y] = 0;
    
    // 移除渲染的棋子
    this.renderer.removeStoneAt(lastMove.x, lastMove.y);
    
    // 切换回上一个玩家
    this.currentPlayer = lastMove.player;
    
    this.emit('undo', { move: lastMove });
    this.emit('playerChanged', { currentPlayer: this.currentPlayer });
    
    // 更新 Web 界面
    if (this.webRenderer) {
      this.webRenderer.updateGameInfo(this.currentPlayer, false);
    }

    return true;
  }

  // Check if current move wins the game
  // BUG: 胜负判断在特定边界情况下有问题
  checkWin(x, y) {
    const player = this.board[x][y];
    const directions = [
      [1, 0], [0, 1], [1, 1], [1, -1]
    ];

    for (const [dx, dy] of directions) {
      let count = 1;
      
      // Count in positive direction
      // BUG: 这里循环条件可能导致数组越界
      for (let i = 1; i < 5; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        // 边界检查有潜在问题 - 在某些边缘情况下可能出错
        if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && this.board[nx][ny] === player) {
          count++;
        } else {
          break;
        }
      }
      
      // Count in negative direction
      for (let i = 1; i < 5; i++) {
        const nx = x - dx * i;
        const ny = y - dy * i;
        if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && this.board[nx][ny] === player) {
          count++;
        } else {
          break;
        }
      }
      
      // BUG: 在某些特殊情况下，可能会误判胜负
      // 比如当棋子在边界时，计算可能有偏差
      if (count >= 5) {
        return true;
      }
    }
    
    return false;
  }

  // 检查是否平局
  checkDraw() {
    for (let x = 0; x < 15; x++) {
      for (let y = 0; y < 15; y++) {
        if (this.board[x][y] === 0) {
          return false; // 还有空位，不是平局
        }
      }
    }
    return true; // 棋盘满了且没有获胜者
  }

  // Get board state
  getBoardState() {
    return {
      board: this.board.map(row => [...row]), // 深拷贝防止外部修改
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver,
      winner: this.winner,
      moveCount: this.moveHistory.length
    };
  }

  // 获取移动历史
  getMoveHistory() {
    return [...this.moveHistory]; // 返回副本
  }

  // Reset game
  reset() {
    this.board = Array(15).fill().map(() => Array(15).fill(0));
    this.currentPlayer = 1;
    this.gameOver = false;
    this.winner = null;
    this.moveHistory = [];
    this.renderer.clear();
    
    this.emit('reset', {});
    console.log('Game reset');
    
    // 更新 Web 界面
    if (this.webRenderer) {
      this.webRenderer.updateGameInfo(1, false);
    }
  }

  // BUG: 析构函数中的内存泄漏问题
  destroy() {
    // 应该清理所有事件监听器，但这里故意遗漏了一些
    this.eventListeners = {}; // 这样清理可能不完全
    this.renderer.destroy();
    // 遗漏清理: this.webRenderer = null;
    // 遗漏清理: this.moveHistory = null;
  }

  // 获取游戏统计信息
  getGameStats() {
    const blackStones = this.moveHistory.filter(move => move.player === 1).length;
    const whiteStones = this.moveHistory.filter(move => move.player === 2).length;
    
    return {
      totalMoves: this.moveHistory.length,
      blackStones,
      whiteStones,
      gameTime: this.moveHistory.length > 0 ? 
        Date.now() - this.moveHistory[0].timestamp : 0
    };
  }
}