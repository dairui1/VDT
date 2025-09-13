import { GobangGame } from './game.js';

class GobangWebApp {
    constructor() {
        this.game = null;
        this.canvas = null;
        this.ctx = null;
        this.cellSize = 40;
        this.boardSize = 15;
        this.padding = 20;
        this.isAutoPlaying = false;
        this.autoPlayInterval = null;
        
        this.initializeApp();
    }

    initializeApp() {
        // 等待 DOM 加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupGame());
        } else {
            this.setupGame();
        }
    }

    setupGame() {
        // 获取 canvas 元素
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 创建游戏实例
        this.game = new GobangGame();
        
        // 设置渲染器为 Web 版本
        this.game.setWebRenderer(this);
        
        // 绑定事件监听器
        this.bindEventListeners();
        
        // 绘制初始棋盘
        this.drawBoard();
        
        this.addDebugLog('游戏初始化完成', 'info');
    }

    bindEventListeners() {
        // 棋盘点击事件
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // 控制按钮事件
        document.getElementById('btn-restart').addEventListener('click', () => this.restartGame());
        document.getElementById('btn-undo').addEventListener('click', () => this.undoMove());
        document.getElementById('btn-auto').addEventListener('click', () => this.toggleAutoPlay());
        document.getElementById('btn-pause').addEventListener('click', () => this.pauseAutoPlay());
        document.getElementById('btn-clear-log').addEventListener('click', () => this.clearDebugLog());
    }

    handleCanvasClick(e) {
        if (this.isAutoPlaying) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 转换为网格坐标 - 这里故意引入一个边界处理错误
        const gridX = Math.floor((x - this.padding) / this.cellSize);
        const gridY = Math.floor((y - this.padding) / this.cellSize);
        
        // BUG: 边界检查有问题，应该检查 >= 0 但这里可能会漏掉某些情况
        if (gridX < 0 || gridX > this.boardSize || gridY < 0 || gridY > this.boardSize) {
            this.addDebugLog(`点击超出边界: (${gridX}, ${gridY})`, 'warning');
            return;
        }
        
        this.addDebugLog(`点击位置: 像素(${Math.round(x)}, ${Math.round(y)}) -> 网格(${gridX}, ${gridY})`, 'debug');
        
        // BUG: 异步操作没有正确处理错误情况
        // 这里可能导致 race condition
        setTimeout(() => {
            const success = this.game.placeStone(gridX, gridY);
            if (!success) {
                this.addDebugLog('落子失败', 'error');
            }
        }, 0); // 故意添加异步延迟，可能导致并发问题
    }

    // Web 渲染接口 - 供 game.js 调用
    renderStone(x, y, color) {
        try {
            // 计算像素位置
            const px = this.padding + x * this.cellSize;
            const py = this.padding + y * this.cellSize;
            
            this.addDebugLog(`渲染${color === 'black' ? '黑' : '白'}子: 网格(${x}, ${y}) -> 像素(${px}, ${py})`, 'debug');
            
            // 绘制棋子
            this.ctx.beginPath();
            this.ctx.arc(px, py, this.cellSize * 0.4, 0, 2 * Math.PI);
            this.ctx.fillStyle = color === 'black' ? '#2c3e50' : '#ecf0f1';
            this.ctx.fill();
            this.ctx.strokeStyle = color === 'black' ? '#1a252f' : '#bdc3c7';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 添加高光效果
            if (color === 'black') {
                this.ctx.beginPath();
                this.ctx.arc(px - 5, py - 5, this.cellSize * 0.1, 0, 2 * Math.PI);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                this.ctx.fill();
            }
            
            return true;
        } catch (error) {
            this.addDebugLog(`渲染失败: ${error.message}`, 'error');
            return false;
        }
    }

    drawBoard() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 设置线条样式
        this.ctx.strokeStyle = '#8b4513';
        this.ctx.lineWidth = 1;
        
        // 绘制网格线
        for (let i = 0; i < this.boardSize; i++) {
            // 垂直线
            const x = this.padding + i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.padding);
            this.ctx.lineTo(x, this.padding + (this.boardSize - 1) * this.cellSize);
            this.ctx.stroke();
            
            // 水平线
            const y = this.padding + i * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y);
            this.ctx.lineTo(this.padding + (this.boardSize - 1) * this.cellSize, y);
            this.ctx.stroke();
        }
        
        // 绘制天元和星位
        this.drawStarPoints();
    }

    drawStarPoints() {
        const starPoints = [
            [3, 3], [3, 11], [11, 3], [11, 11], [7, 7]
        ];
        
        this.ctx.fillStyle = '#8b4513';
        starPoints.forEach(([x, y]) => {
            const px = this.padding + x * this.cellSize;
            const py = this.padding + y * this.cellSize;
            this.ctx.beginPath();
            this.ctx.arc(px, py, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        });
    }

    updateGameInfo(currentPlayer, gameOver, winner) {
        const playerElement = document.getElementById('current-player');
        const statusElement = document.getElementById('game-status');
        
        if (gameOver) {
            playerElement.textContent = '';
            statusElement.textContent = winner ? `${winner === 1 ? '黑棋' : '白棋'}获胜！` : '游戏结束';
            statusElement.style.color = '#e74c3c';
        } else {
            playerElement.textContent = currentPlayer === 1 ? '黑棋' : '白棋';
            playerElement.className = currentPlayer === 1 ? 'player-black' : 'player-white';
            statusElement.textContent = '游戏进行中';
            statusElement.style.color = '#27ae60';
        }
    }

    restartGame() {
        this.game.reset();
        this.drawBoard();
        this.updateGameInfo(1, false);
        this.addDebugLog('游戏重新开始', 'info');
        
        if (this.isAutoPlaying) {
            this.pauseAutoPlay();
        }
    }

    undoMove() {
        if (this.game.undoLastMove()) {
            this.drawBoard();
            this.redrawAllStones();
            this.addDebugLog('悔棋成功', 'info');
        } else {
            this.addDebugLog('无法悔棋', 'warning');
        }
    }

    redrawAllStones() {
        const state = this.game.getBoardState();
        for (let x = 0; x < this.boardSize; x++) {
            for (let y = 0; y < this.boardSize; y++) {
                if (state.board[x][y] !== 0) {
                    const color = state.board[x][y] === 1 ? 'black' : 'white';
                    this.renderStone(x, y, color);
                }
            }
        }
    }

    toggleAutoPlay() {
        if (this.isAutoPlaying) {
            this.pauseAutoPlay();
        } else {
            this.startAutoPlay();
        }
    }

    startAutoPlay() {
        this.isAutoPlaying = true;
        document.getElementById('btn-auto').style.display = 'none';
        document.getElementById('btn-pause').style.display = 'inline-block';
        
        this.addDebugLog('开始自动对局演示', 'info');
        
        this.autoPlayInterval = setInterval(() => {
            if (this.game.gameOver) {
                this.pauseAutoPlay();
                return;
            }
            
            // 生成随机落子位置
            const validMoves = this.getValidMoves();
            if (validMoves.length > 0) {
                const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                this.game.placeStone(randomMove[0], randomMove[1]);
            }
        }, 1000);
    }

    pauseAutoPlay() {
        this.isAutoPlaying = false;
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
        
        document.getElementById('btn-auto').style.display = 'inline-block';
        document.getElementById('btn-pause').style.display = 'none';
        
        this.addDebugLog('自动对局已暂停', 'info');
    }

    getValidMoves() {
        const state = this.game.getBoardState();
        const validMoves = [];
        
        // BUG: 循环边界可能导致数组越界
        // 应该是 < this.boardSize 但这里用了 <= 
        for (let x = 0; x <= this.boardSize; x++) {
            for (let y = 0; y <= this.boardSize; y++) {
                // 这里访问 state.board[15][15] 会越界
                if (state.board[x] && state.board[x][y] === 0) {
                    validMoves.push([x, y]);
                }
            }
        }
        
        return validMoves;
    }

    addDebugLog(message, level = 'info') {
        const logContainer = document.getElementById('debug-log');
        const entry = document.createElement('div');
        entry.className = `log-entry log-${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${message}`;
        
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // 限制日志条目数量
        while (logContainer.children.length > 100) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    clearDebugLog() {
        document.getElementById('debug-log').innerHTML = '';
        this.addDebugLog('调试日志已清空', 'info');
    }
}

// 初始化应用
const app = new GobangWebApp();