export class ConsoleRenderer {
    constructor() {
        this.symbols = {
            empty: '.',
            snake: '█',
            head: '●',
            food: '●'
        };
    }

    render(gameState) {
        const { snake, food, score, gameOver, paused, width, height } = gameState;
        
        // Clear console (for Node.js environment)
        if (typeof process !== 'undefined') {
            console.clear();
        }

        // Create grid
        const grid = Array(height).fill().map(() => Array(width).fill(this.symbols.empty));

        // Place snake
        snake.forEach((segment, index) => {
            if (segment.x >= 0 && segment.x < width && segment.y >= 0 && segment.y < height) {
                grid[segment.y][segment.x] = index === 0 ? this.symbols.head : this.symbols.snake;
            }
        });

        // Place food
        if (food.x >= 0 && food.x < width && food.y >= 0 && food.y < height) {
            grid[food.y][food.x] = this.symbols.food;
        }

        // Render border and game
        const border = '┌' + '─'.repeat(width) + '┐';
        const bottomBorder = '└' + '─'.repeat(width) + '┘';
        
        console.log(border);
        grid.forEach(row => {
            console.log('│' + row.join('') + '│');
        });
        console.log(bottomBorder);

        // Status
        console.log(`Score: ${score} | Length: ${snake.length}`);
        if (gameOver) {
            console.log('GAME OVER! Press R to restart');
        } else if (paused) {
            console.log('PAUSED - Press SPACE to continue');
        } else {
            console.log('Use WASD to move, SPACE to pause, R to restart');
        }
    }
}

export class CanvasRenderer {
    constructor(canvas, cellSize = 20) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cellSize = cellSize;
        
        // Colors
        this.colors = {
            background: '#1a1a1a',
            snake: '#00ff00',
            head: '#ffff00',
            food: '#ff0000',
            grid: '#333333'
        };
    }

    resize(width, height) {
        this.canvas.width = width * this.cellSize;
        this.canvas.height = height * this.cellSize;
    }

    render(gameState) {
        const { snake, food, score, gameOver, paused, width, height } = gameState;
        
        // Resize if needed
        if (this.canvas.width !== width * this.cellSize || this.canvas.height !== height * this.cellSize) {
            this.resize(width, height);
        }

        // Clear canvas
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid(width, height);

        // Draw food
        this.drawCell(food.x, food.y, this.colors.food);

        // Draw snake
        snake.forEach((segment, index) => {
            const color = index === 0 ? this.colors.head : this.colors.snake;
            this.drawCell(segment.x, segment.y, color);
        });

        // Draw game over overlay
        if (gameOver) {
            this.drawOverlay('GAME OVER', 'Press R to restart');
        } else if (paused) {
            this.drawOverlay('PAUSED', 'Press SPACE to continue');
        }
    }

    drawGrid(width, height) {
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;

        // Vertical lines
        for (let x = 0; x <= width; x++) {
            const xPos = x * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(xPos, 0);
            this.ctx.lineTo(xPos, height * this.cellSize);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= height; y++) {
            const yPos = y * this.cellSize;
            this.ctx.beginPath();
            this.ctx.moveTo(0, yPos);
            this.ctx.lineTo(width * this.cellSize, yPos);
            this.ctx.stroke();
        }
    }

    drawCell(x, y, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            x * this.cellSize + 1,
            y * this.cellSize + 1,
            this.cellSize - 2,
            this.cellSize - 2
        );
    }

    drawOverlay(title, subtitle) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // Semi-transparent background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Title
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(title, centerX, centerY - 20);

        // Subtitle
        this.ctx.font = '24px Arial';
        this.ctx.fillText(subtitle, centerX, centerY + 30);
    }
}