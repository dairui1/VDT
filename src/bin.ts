#!/usr/bin/env node

import { VDTServer } from './server.js';
import { HudManager } from './utils/hud.js';

// Parse command line arguments
const args = process.argv.slice(2);
const shouldStartHud = args.includes('--hud') || args.includes('--with-hud');
const hudPort = args.find(arg => arg.startsWith('--hud-port='))?.split('=')[1] || '3900';

async function startVDT() {
  const server = new VDTServer();
  
  // If HUD is requested, start it first
  if (shouldStartHud) {
    console.log('[VDT] Starting debug HUD...');
    const hudManager = new HudManager();
    
    try {
      // Start a standalone HUD instance
      const hudResult = await hudManager.startStandaloneHud(parseInt(hudPort));
      console.log(`[VDT] Debug HUD started at: ${hudResult.hudUrl}`);
      console.log('[VDT] You can now view the debug interface in your browser');
    } catch (error) {
      console.warn('[VDT] Failed to start HUD:', error instanceof Error ? error.message : error);
      console.log('[VDT] Continuing without HUD...');
    }
  }
  
  // Start the MCP server
  console.log('[VDT] Starting MCP server...');
  await server.run();
}

startVDT().catch((error) => {
  console.error('[VDT] Fatal error:', error);
  process.exit(1);
});