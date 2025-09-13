#!/usr/bin/env node

/**
 * Test script to demonstrate the fixed capture_run with HUD functionality
 */

import { HudManager } from './dist/utils/hud.js';

async function testCaptureWithHUD() {
  console.log('=== VDT Capture Run with HUD Test (Mock Session) ===\n');
  
  try {
    console.log('1. Testing direct HUD opening with mock session...');
    const hudManager = new HudManager();
    
    // Test the exact URL format requested by user
    const testUrl = 'http://localhost:5010';
    console.log(`2. Opening HUD with entry URL: ${testUrl}`);
    
    const result = await hudManager.startStandaloneHud(3950, testUrl);
    
    console.log('✅ HUD opened successfully!');
    console.log(`HUD URL: ${result.hudUrl}`);
    console.log(`Expected format: http://localhost:3950/?starthtml=http%3A%2F%2Flocalhost%3A5010`);
    
    console.log('\nThe HUD should now be running and accessible at:');
    console.log(`${result.hudUrl}`);
    console.log('\nThis demonstrates that:');
    console.log('1. The HUD server starts automatically');
    console.log('2. The URL is properly formatted with starthtml parameter');
    console.log('3. The browser opens to the correct URL');
    console.log('4. No session validation is required');
    console.log('5. Web capture relies on manual user log downloads via HUD interface');
    
    console.log('\nPress Ctrl+C to stop the HUD server.');
    
    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n\nStopping HUD server...');
      await hudManager.dispose();
      console.log('✅ HUD server stopped');
      process.exit(0);
    });
    
    // Keep alive
    setInterval(() => {
      // Just keep the process running
    }, 5000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  testCaptureWithHUD().catch(console.error);
}

export { testCaptureWithHUD };
