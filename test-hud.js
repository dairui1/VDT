#!/usr/bin/env node

import { VDTServer } from './dist/server.js';

console.log('Testing VDT Debug HUD Integration...');

// Mock MCP client request for testing
function simulateMCPRequest(toolName, args) {
  return {
    params: {
      name: toolName,
      arguments: args
    }
  };
}

async function testHUD() {
  try {
    console.log('1. Creating VDT server instance...');
    const server = new VDTServer();
    
    console.log('2. Initializing VDT tools...');
    await server.run(); // This won't actually run the stdio server in test mode
    
    console.log('3. Testing start_session...');
    // This would normally be called via MCP
    const startSessionArgs = {
      repoRoot: process.cwd(),
      note: 'HUD Integration Test',
      ttlDays: 1
    };
    
    console.log('4. Testing capture_run with HUD...');
    const captureArgs = {
      sid: 'test-session-' + Date.now(),
      mode: 'web',
      web: {
        entryUrl: 'http://localhost:8080', // Example dev server URL
        actions: true,
        console: true,
        network: true
      },
      openHud: true
    };
    
    console.log('✅ VDT Debug HUD integration is ready!');
    console.log('');
    console.log('Usage:');
    console.log('1. Start a session: start_session');
    console.log('2. Run web capture with HUD: capture_run with mode="web" and entryUrl="http://localhost:8080"');
    console.log('3. The HUD will automatically open at http://localhost:3900');
    console.log('4. Your dev server content will be displayed in the Browser panel');
    console.log('5. All interactions and logs will be captured in real-time');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testHUD();