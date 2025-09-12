// Gobang Game Renderer
export class GameRenderer {
  constructor(cellSize = 20) {
    this.cellSize = cellSize;
    this.boardSize = 15;
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
  pixelToGrid(px, py) {
    const x = Math.floor(px / this.cellSize);
    const y = Math.floor(py / this.cellSize);
    
    if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
      return null;
    }
    
    return [x, y];
  }

  // Render a stone at given grid position
  renderStone(x, y, color = 'black') {
    try {
      const [px, py] = this.gridToPixel(x, y);
      console.log(`Rendering ${color} stone at grid (${x}, ${y}) -> pixel (${px}, ${py})`);
      
      // Simulate rendering logic
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

  // Clear the board
  clear() {
    console.log('Clearing board');
  }
}