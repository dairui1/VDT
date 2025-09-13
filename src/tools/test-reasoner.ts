#!/usr/bin/env node

import { ReasonerRunTool } from './reasoner-run.js';
import { SessionManager } from '../utils/session.js';
import { CaptureManager } from '../utils/capture.js';
import { AnalysisEngine } from '../utils/analysis.js';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testReasonerRun() {
  console.log('[TEST] Starting Reasoner CLI Test');
  
  // Create tool instances
  const sessionManager = new SessionManager();
  const captureManager = new CaptureManager();
  const analysisEngine = new AnalysisEngine();
  
  const reasonerTool = new ReasonerRunTool(sessionManager, captureManager, analysisEngine);

  try {
    // Create a test session first
    console.log('[TEST] Creating test session...');
    const session = await sessionManager.createSession(process.cwd(), 'Test reasoner CLI', 1);
    console.log('[TEST] Session created:', session.sid);

    // Create some test content
    const sessionDir = sessionManager.getSessionDir(session.sid);
    const analysisDir = path.join(sessionDir, 'analysis');
    
    await fs.mkdir(analysisDir, { recursive: true });
    
    // Create a mock buglens report
    const buglensContent = `# BugLens Report

## Errors Found
- TypeError at line 42 in main.js
- Undefined variable 'config' in utils.js

## Analysis
Multiple errors indicate initialization issues.`;

    await fs.writeFile(path.join(analysisDir, 'buglens.md'), buglensContent);

    // Create a test code file
    const codeDir = path.join(sessionDir, 'code');
    await fs.mkdir(codeDir, { recursive: true });
    
    const testCode = `function main() {
  // Missing error handling
  const result = processData();
  return result;
}

function processData() {
  // Potential null reference
  return config.getValue();
}`;
    
    await fs.writeFile(path.join(codeDir, 'main.js'), testCode);

    // Test parameters
    const testParams = {
      sid: session.sid,
      task: 'analyze_root_cause' as const,
      inputs: {
        buglens: `vdt://sessions/${session.sid}/analysis/buglens.md`,
        code: [`file://${path.join(codeDir, 'main.js')}`]
      },
      context: {
        selectedIds: ['chunk1', 'chunk2'],
        notes: 'Test run for codex CLI integration'
      }
    };

    console.log('[TEST] Executing reasoner_run with parameters:', JSON.stringify(testParams, null, 2));
    
    // Execute the reasoner run
    const startTime = Date.now();
    const result = await reasonerTool.execute(testParams);
    const duration = Date.now() - startTime;

    console.log(`[TEST] Reasoner execution completed in ${duration}ms`);
    console.log('[TEST] Result:', JSON.stringify(result, null, 2));

    // Check if files were created
    const reasoningPath = path.join(analysisDir, 'reasoning.md');
    const jsonPath = path.join(analysisDir, 'reasoner_analyze_root_cause.json');
    
    const reasoningExists = await fs.access(reasoningPath).then(() => true).catch(() => false);
    const jsonExists = await fs.access(jsonPath).then(() => true).catch(() => false);
    
    console.log('[TEST] Files created:');
    console.log(`  - reasoning.md: ${reasoningExists}`);
    console.log(`  - reasoner_analyze_root_cause.json: ${jsonExists}`);

    if (reasoningExists) {
      const reasoningContent = await fs.readFile(reasoningPath, 'utf-8');
      console.log('[TEST] Reasoning content preview:');
      console.log(reasoningContent.substring(0, 500) + '...');
    }

    // Test with propose_patch task
    console.log('\n[TEST] Testing propose_patch task...');
    const patchParams = {
      ...testParams,
      task: 'propose_patch' as const
    };

    const patchResult = await reasonerTool.execute(patchParams);
    console.log('[TEST] Patch result:', JSON.stringify(patchResult, null, 2));

    console.log('\n[TEST] All tests completed successfully!');

  } catch (error) {
    console.error('[TEST] Test failed:', error);
    
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    
    process.exit(1);
  }
}

// Check for codex availability
async function checkCodexAvailability() {
  console.log('[TEST] Checking codex CLI availability...');
  
  const { spawn } = await import('child_process');
  
  return new Promise<boolean>((resolve) => {
    const child = spawn('codex', ['--version'], { stdio: 'pipe' });
    
    child.on('close', (code) => {
      const available = code === 0;
      console.log(`[TEST] Codex CLI available: ${available}`);
      if (!available) {
        console.log('[TEST] Note: codex CLI not found - will use fallback implementation');
      }
      resolve(available);
    });
    
    child.on('error', () => {
      console.log('[TEST] Codex CLI not available - will use fallback implementation');
      resolve(false);
    });
  });
}

// Run the test
async function main() {
  console.log('='.repeat(50));
  console.log('VDT Reasoner CLI Integration Test');
  console.log('='.repeat(50));
  
  await checkCodexAvailability();
  await testReasonerRun();
  
  console.log('\n✅ Test suite completed successfully!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testReasonerRun, checkCodexAvailability };
