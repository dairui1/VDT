#!/usr/bin/env node

/**
 * Simple script to test HUD opening with mock session
 * Usage: node scripts/test-hud-mock.js [entry-url]
 */

import { HudManager } from '../dist/utils/hud.js';

const entryUrl = process.argv[2] || 'http://localhost:5010';

console.log(`Testing HUD with entry URL: ${entryUrl}`);
console.log('Starting HUD server...\n');

const hudManager = new HudManager();

try {
  const result = await hudManager.startStandaloneHud(3950, entryUrl);
  
  console.log('✅ Success!');
  console.log(`HUD URL: ${result.hudUrl}`);
  console.log('\nYour browser should now open to the HUD interface.');
  console.log('Press Ctrl+C to stop the server.');
  
  // Handle cleanup
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await hudManager.dispose();
    process.exit(0);
  });
  
  // Keep alive
  setInterval(() => {}, 1000);
  
} catch (error) {
  console.error('❌ Failed to start HUD:', error.message);
  process.exit(1);
}
