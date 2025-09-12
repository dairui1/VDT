import { GobangGame } from './game.js';

console.log('Gobang Game - Interactive Mode');
console.log('This is a simple implementation for VDT debugging demonstration');

const game = new GobangGame();

// For demonstration, just place a few stones
game.placeStone(7, 7);
game.placeStone(7, 8);
game.placeStone(8, 7);

console.log('Game state:', game.getBoardState());