import { GameController } from './main.js';
import { ConsoleRenderer } from './renderer.js';

console.log('🐍 Snake Game - Console Version');
console.log('===============================');
console.log('Controls:');
console.log('- W/A/S/D or Arrow Keys: Move');
console.log('- SPACE: Pause/Unpause');
console.log('- R: Restart');
console.log('- Ctrl+C: Quit');
console.log('===============================\n');

// Create and start the game
const gameController = new GameController({
    width: 20,
    height: 20,
    speed: 150
});

console.log('Starting game...\n');
gameController.start();