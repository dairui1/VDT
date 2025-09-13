import { SnakeGame } from './game.js';

// Test script to verify food generation bug fix
console.log('Testing food generation bug fix...');

const game = new SnakeGame(5, 5); // Small board for easier testing

// Fill most of the board with snake body to test collision avoidance
game.snake = [];
for (let i = 0; i < 20; i++) {
    game.snake.push({ x: i % 5, y: Math.floor(i / 5) });
}

console.log('Snake body covers most of 5x5 board:', game.snake.length, 'segments');
console.log('Available positions for food:', (5 * 5) - game.snake.length);

// Generate food multiple times to ensure it never collides with snake body
for (let i = 0; i < 50; i++) {
    const food = game.generateFood();
    console.log(`Food ${i + 1}:`, JSON.stringify(food));
    
    // Check if food is on snake body
    const isOnSnakeBody = game.snake.some(segment => 
        segment.x === food.x && segment.y === food.y
    );
    
    if (isOnSnakeBody) {
        console.log(`BUG DETECTED: Food generated on snake body at position (${food.x}, ${food.y})`);
        process.exit(1);
    }
}

console.log('SUCCESS: All food generated in valid positions - bug is fixed!');