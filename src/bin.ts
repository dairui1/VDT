#!/usr/bin/env node

import { VDTServer } from './server.js';

const server = new VDTServer();
server.run().catch((error) => {
  console.error('[VDT] Fatal error:', error);
  process.exit(1);
});