import { GobangGame } from './game.js';

// Demo script that will trigger various bugs and edge cases
class GobangDemo {
  constructor() {
    this.game = new GobangGame();
    this.demoMoves = [
      // 基础移动，展示正常功能
      [7, 7],   // Center
      [7, 8],   // Adjacent  
      [8, 7],   // Adjacent
      [6, 6],   // Diagonal
      [9, 9],   // Further out
      
      // 触发边界检查错误的移动
      [14, 14], // 边界位置
      [0, 0],   // 另一个边界
      [14, 0],  // 边界角落
      
      // 尝试触发胜负判断错误
      [7, 9],   // 继续水平线
      [8, 8],   // 对角线
      [7, 10],  // 可能形成五子
      [9, 7],   // 对抗
      [7, 11],  // 应该获胜但可能出现判断错误
    ];
    
    this.autoMoveIndex = 0;
    this.isRunning = false;
  }

  // 运行完整演示
  async runFullDemo() {
    console.log('=== 五子棋 Demo 开始 ===');
    console.log('这个演示将触发多个预设的错误，用于测试 VDT 调试功能');
    
    // 设置事件监听器来观察游戏状态
    this.setupEventListeners();
    
    // 基础功能测试
    await this.runBasicGameplay();
    
    // 边界情况测试
    await this.runEdgeCaseTests();
    
    // 错误触发测试
    await this.runErrorTriggerTests();
    
    // 性能和内存测试
    await this.runPerformanceTests();
    
    console.log('=== Demo 完成 ===');
  }

  // 设置事件监听器
  setupEventListeners() {
    this.game.addEventListener('move', (data) => {
      console.log(`📍 落子: 玩家${data.player} 在 (${data.x}, ${data.y})`);
    });

    this.game.addEventListener('error', (data) => {
      console.error(`❌ 错误: ${data.message} (${data.code})`);
    });

    this.game.addEventListener('gameOver', (data) => {
      console.log(`🏆 游戏结束! 玩家${data.winner}获胜!`);
    });

    this.game.addEventListener('playerChanged', (data) => {
      console.log(`🔄 轮到玩家${data.currentPlayer}`);
    });
  }

  // 基础游戏功能演示
  async runBasicGameplay() {
    console.log('\n--- 基础游戏功能测试 ---');
    
    for (let i = 0; i < Math.min(5, this.demoMoves.length); i++) {
      const [x, y] = this.demoMoves[i];
      console.log(`\n第${i + 1}步: 尝试在 (${x}, ${y}) 落子`);
      
      const success = this.game.placeStone(x, y);
      if (!success) {
        console.error(`第${i + 1}步失败`);
      }
      
      // 显示当前游戏状态
      const state = this.game.getBoardState();
      console.log(`当前玩家: ${state.currentPlayer}, 游戏结束: ${state.gameOver}`);
      
      await this.delay(500); // 模拟思考时间
    }
  }

  // 边界情况测试
  async runEdgeCaseTests() {
    console.log('\n--- 边界情况测试 ---');
    
    // 测试边界位置落子
    const edgeCases = [
      [14, 14], // 右下角
      [0, 0],   // 左上角
      [15, 7],  // 超出边界 - 应该触发边界检查错误
      [-1, 5],  // 负坐标
      [7, 16],  // Y坐标超界
    ];

    for (const [x, y] of edgeCases) {
      console.log(`\n测试边界情况: (${x}, ${y})`);
      try {
        const success = this.game.placeStone(x, y);
        if (success) {
          console.log(`✓ 边界位置 (${x}, ${y}) 落子成功`);
        } else {
          console.log(`✗ 边界位置 (${x}, ${y}) 落子失败`);
        }
      } catch (error) {
        console.error(`边界测试异常: ${error.message}`);
      }
      
      await this.delay(300);
    }
  }

  // 错误触发测试
  async runErrorTriggerTests() {
    console.log('\n--- 错误触发测试 ---');
    
    // 测试重复落子
    console.log('\n测试重复落子错误:');
    const [x, y] = [7, 7]; // 已经有棋子的位置
    console.log(`尝试在已占位置 (${x}, ${y}) 再次落子`);
    const duplicateResult = this.game.placeStone(x, y);
    console.log(`重复落子结果: ${duplicateResult}`);

    // 测试悔棋功能
    console.log('\n测试悔棋功能:');
    const undoResult = this.game.undoLastMove();
    console.log(`悔棋结果: ${undoResult}`);
    
    if (undoResult) {
      console.log('悔棋成功，再次尝试落子');
      const retryResult = this.game.placeStone(x, y);
      console.log(`重新落子结果: ${retryResult}`);
    }

    // 测试游戏统计
    console.log('\n游戏统计信息:');
    const stats = this.game.getGameStats();
    console.log(`总步数: ${stats.totalMoves}`);
    console.log(`黑子数量: ${stats.blackStones}`);
    console.log(`白子数量: ${stats.whiteStones}`);
    console.log(`游戏时长: ${stats.gameTime}ms`);
  }

  // 性能和内存测试
  async runPerformanceTests() {
    console.log('\n--- 性能和内存测试 ---');
    
    // 快速连续落子测试
    console.log('快速连续落子测试...');
    const startTime = Date.now();
    
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(Math.random() * 15);
      const y = Math.floor(Math.random() * 15);
      
      try {
        this.game.placeStone(x, y);
      } catch (error) {
        console.error(`快速落子错误: ${error.message}`);
      }
      
      // 每10步检查一次内存使用
      if (i % 10 === 0) {
        console.log(`完成 ${i} 步快速落子...`);
      }
    }
    
    const endTime = Date.now();
    console.log(`快速落子测试完成，耗时: ${endTime - startTime}ms`);
    
    // 重置游戏多次，测试内存泄漏
    console.log('\n内存泄漏测试 - 多次重置游戏...');
    for (let i = 0; i < 5; i++) {
      this.game.reset();
      console.log(`第${i + 1}次重置完成`);
      await this.delay(100);
    }
  }

  // 自动对局模式
  async startAutoPlay() {
    console.log('\n--- 自动对局模式 ---');
    this.isRunning = true;
    this.autoMoveIndex = 0;
    
    while (this.isRunning && !this.game.gameOver && this.autoMoveIndex < this.demoMoves.length) {
      const [x, y] = this.demoMoves[this.autoMoveIndex];
      
      console.log(`\n自动对局第${this.autoMoveIndex + 1}步: (${x}, ${y})`);
      
      try {
        const success = this.game.placeStone(x, y);
        if (!success) {
          console.log(`自动落子失败，尝试随机位置`);
          const randomMove = this.getRandomValidMove();
          if (randomMove) {
            this.game.placeStone(randomMove[0], randomMove[1]);
          }
        }
      } catch (error) {
        console.error(`自动对局错误: ${error.message}`);
      }
      
      this.autoMoveIndex++;
      await this.delay(1000); // 1秒间隔
    }
    
    if (this.game.gameOver) {
      console.log('🎯 自动对局结束！');
    } else {
      console.log('自动对局暂停');
    }
  }

  // 获取随机有效移动
  getRandomValidMove() {
    const validMoves = [];
    const state = this.game.getBoardState();
    
    for (let x = 0; x < 15; x++) {
      for (let y = 0; y < 15; y++) {
        if (state.board[x][y] === 0) {
          validMoves.push([x, y]);
        }
      }
    }
    
    if (validMoves.length > 0) {
      const randomIndex = Math.floor(Math.random() * validMoves.length);
      return validMoves[randomIndex];
    }
    
    return null;
  }

  // 停止自动对局
  stopAutoPlay() {
    this.isRunning = false;
    console.log('自动对局已停止');
  }

  // 延时函数
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 输出调试信息
  debugInfo() {
    console.log('\n=== 调试信息 ===');
    const state = this.game.getBoardState();
    const history = this.game.getMoveHistory();
    
    console.log(`棋盘状态: ${state.currentPlayer === 1 ? '黑棋' : '白棋'}回合`);
    console.log(`游戏是否结束: ${state.gameOver}`);
    console.log(`移动历史长度: ${history.length}`);
    
    if (history.length > 0) {
      console.log('最近5步移动:');
      const recent = history.slice(-5);
      recent.forEach((move, index) => {
        console.log(`  ${history.length - recent.length + index + 1}. 玩家${move.player} -> (${move.x}, ${move.y})`);
      });
    }
    
    // 渲染器状态
    const stones = this.game.renderer.getAllStones();
    console.log(`渲染器记录的棋子数量: ${stones.length}`);
  }
}

// 运行演示的函数
async function runDemo() {
  console.log('五子棋 Demo 启动中...');
  
  const demo = new GobangDemo();
  
  try {
    // 如果有命令行参数，决定运行哪种模式
    const args = process.argv.slice(2);
    
    if (args.includes('--auto')) {
      await demo.startAutoPlay();
    } else if (args.includes('--edge-cases')) {
      await demo.runEdgeCaseTests();
    } else if (args.includes('--performance')) {
      await demo.runPerformanceTests();
    } else {
      // 默认运行完整演示
      await demo.runFullDemo();
    }
    
    // 最后输出调试信息
    demo.debugInfo();
    
  } catch (error) {
    console.error(`Demo 运行出错: ${error.message}`);
    console.error(error.stack);
  }
}

// 如果直接运行此文件，启动演示
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { GobangDemo };