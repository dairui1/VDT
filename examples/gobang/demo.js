import { GobangGame } from './game.js';

// Demo script that will trigger the rendering bug
function runDemo() {
  console.log('Starting Gobang Demo...');
  
  const game = new GobangGame();
  
  // Simulate some game moves that will show the alignment issue
  const moves = [
    [7, 7],   // Center
    [7, 8],   // Adjacent  
    [8, 7],   // Adjacent
    [6, 6],   // Diagonal
    [9, 9]    // Further out
  ];

  console.log('Placing stones...');
  
  for (const [x, y] of moves) {
    console.log(`\n--- Move: (${x}, ${y}) ---`);
    const success = game.placeStone(x, y);
    
    if (!success) {
      console.error(`Failed to place stone at (${x}, ${y})`);
    }
    
    // Log current state
    const state = game.getBoardState();
    console.log(`Current player: ${state.currentPlayer}`);
    console.log(`Game over: ${state.gameOver}`);
  }

  // Try some edge cases that might trigger errors
  console.log('\n--- Testing edge cases ---');
  
  try {
    // Test invalid coordinates
    game.placeStone(-1, 5);
  } catch (error) {
    console.error(`Edge case error: ${error.message}`);
  }
  
  try {
    // Test out of bounds
    game.placeStone(15, 15);
  } catch (error) {
    console.error(`Edge case error: ${error.message}`);
  }

  console.log('\nDemo completed!');
}

// Run the demo
runDemo();