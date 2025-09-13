export class SnakeGame {
    constructor(width = 20, height = 20) {
        this.width = width;
        this.height = height;
        this.reset();
    }

    reset() {
        this.snake = [{ x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) }];
        this.direction = { x: 1, y: 0 };
        this.food = this.generateFood();
        this.score = 0;
        this.gameOver = false;
        this.paused = false;
    }

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

    setDirection(newDirection) {
        if (this.gameOver || this.paused) return;
        
        // Prevent reverse direction
        if (this.direction.x !== 0 && newDirection.x !== 0) return;
        if (this.direction.y !== 0 && newDirection.y !== 0) return;
        
        this.direction = newDirection;
    }

    move() {
        if (this.gameOver || this.paused) return;

        const head = { ...this.snake[0] };
        head.x += this.direction.x;
        head.y += this.direction.y;

        // Check wall collision
        if (head.x < 0 || head.x >= this.width || head.y < 0 || head.y >= this.height) {
            this.gameOver = true;
            return;
        }

        // Check self collision
        if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
            this.gameOver = true;
            return;
        }

        this.snake.unshift(head);

        // Check food collision
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score += 10;
            this.food = this.generateFood();
        } else {
            this.snake.pop();
        }
    }

    togglePause() {
        this.paused = !this.paused;
    }

    getState() {
        return {
            snake: [...this.snake],
            food: { ...this.food },
            score: this.score,
            gameOver: this.gameOver,
            paused: this.paused,
            width: this.width,
            height: this.height
        };
    }

    // AI helper methods
    getValidMoves() {
        const moves = [
            { x: 0, y: -1, name: 'UP' },
            { x: 0, y: 1, name: 'DOWN' },
            { x: -1, y: 0, name: 'LEFT' },
            { x: 1, y: 0, name: 'RIGHT' }
        ];

        return moves.filter(move => {
            // Can't reverse
            if (this.direction.x !== 0 && move.x !== 0) return false;
            if (this.direction.y !== 0 && move.y !== 0) return false;

            const head = this.snake[0];
            const newHead = { x: head.x + move.x, y: head.y + move.y };

            // Check boundaries
            if (newHead.x < 0 || newHead.x >= this.width || newHead.y < 0 || newHead.y >= this.height) {
                return false;
            }

            // Check self collision
            return !this.snake.some(segment => segment.x === newHead.x && segment.y === newHead.y);
        });
    }

    getDistanceToFood() {
        const head = this.snake[0];
        return Math.abs(head.x - this.food.x) + Math.abs(head.y - this.food.y);
    }
}