import { GameRenderer } from './renderer.js';

export class GobangGame {
  constructor() {
    this.renderer = new GameRenderer(20);
    this.board = Array(15).fill().map(() => Array(15).fill(0));
    this.currentPlayer = 1; // 1 for black, 2 for white
    this.gameOver = false;
  }

  // Place a stone at given coordinates
  placeStone(x, y) {
    if (this.gameOver) {
      console.log('Game is over');
      return false;
    }

    if (this.board[x][y] !== 0) {
      console.log(`Position (${x}, ${y}) is already occupied`);
      return false;
    }

    // Place stone on board
    this.board[x][y] = this.currentPlayer;
    
    // Render the stone
    const color = this.currentPlayer === 1 ? 'black' : 'white';
    const renderResult = this.renderer.renderStone(x, y, color);
    
    if (!renderResult) {
      console.error(`Failed to render stone at (${x}, ${y})`);
      return false;
    }

    // Check for win condition
    if (this.checkWin(x, y)) {
      console.log(`Player ${this.currentPlayer} wins!`);
      this.gameOver = true;
    } else {
      // Switch player
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }

    return true;
  }

  // Check if current move wins the game
  checkWin(x, y) {
    const player = this.board[x][y];
    const directions = [
      [1, 0], [0, 1], [1, 1], [1, -1]
    ];

    for (const [dx, dy] of directions) {
      let count = 1;
      
      // Count in positive direction
      for (let i = 1; i < 5; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
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
      
      if (count >= 5) {
        return true;
      }
    }
    
    return false;
  }

  // Get board state
  getBoardState() {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver
    };
  }

  // Reset game
  reset() {
    this.board = Array(15).fill().map(() => Array(15).fill(0));
    this.currentPlayer = 1;
    this.gameOver = false;
    this.renderer.clear();
    console.log('Game reset');
  }
}