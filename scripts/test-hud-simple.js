#!/usr/bin/env node

import { HudManager } from '../dist/utils/hud.js';

console.log('🚀 Testing VDT HUD Standalone...');

async function testHUD() {
  try {
    const hudManager = new HudManager();
    
    console.log('Starting standalone HUD...');
    const result = await hudManager.startStandaloneHud(3900);
    
    console.log('✅ HUD started successfully!');
    console.log(`🌐 URL: ${result.hudUrl}`);
    console.log(`🔌 Port: ${result.port}`);
    console.log('');
    console.log('📱 You can now:');
    console.log('1. Open the URL in your browser');
    console.log('2. Test with a custom URL: http://localhost:3900?sid=test&url=http://localhost:8080');
    console.log('3. Press Ctrl+C to stop');
    
    // Keep running
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping HUD...');
      process.exit(0);
    });
    
    // Keep the process alive
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ Failed to start HUD:', error);
    process.exit(1);
  }
}

testHUD();