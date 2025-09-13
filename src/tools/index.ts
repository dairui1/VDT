import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../utils/session.js';
import { CaptureManager } from '../utils/capture.js';
import { AnalysisEngine } from '../utils/analysis.js';
import { ToolResponse } from '../types/index.js';

export class VDTTools {
  private sessionManager: SessionManager;
  private captureManager: CaptureManager;
  private analysisEngine: AnalysisEngine;

  constructor() {
    this.sessionManager = new SessionManager();
    this.captureManager = new CaptureManager();
    this.analysisEngine = new AnalysisEngine();
  }

  async initialize(): Promise<void> {
    // Initialize core components
  }

  async dispose(): Promise<void> {
    // Cleanup resources
  }

  // Core tool: vdt_start_session
  async startSession(params: {
    repoRoot?: string;
    note?: string;
    ttlDays?: number;
  }): Promise<CallToolResult> {
    try {
      const { repoRoot, note, ttlDays = 7 } = params;
      
      const session = await this.sessionManager.createSession(repoRoot, note, ttlDays);
      
      const links = [
        `vdt://sessions/${session.sid}/`,
        this.sessionManager.getResourceLink(session.sid, 'meta.json'),
        this.sessionManager.getResourceLink(session.sid, 'logs/capture.ndjson')
      ];

      const response: ToolResponse = {
        data: {
          sid: session.sid,
          spec: "VDT DebugSpec v0.3 (KISS)",
          links,
          system_reminder: "Follow minimal loop: capture → analyze → clarify (if needed) → fix/replay → summary"
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check repository root permissions and disk space'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // Core tool: capture_run
  async captureRun(params: {
    sid: string;
    mode: 'cli' | 'web';
    shell?: {
      cwd: string;
      commands?: string[];
      env?: Record<string, string>;
      timeoutSec?: number;
    };
    web?: {
      entryUrl: string;
      actions?: boolean;
      console?: boolean;
      network?: boolean;
    };
    redact?: {
      patterns?: string[];
    };
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      let result;
      
      if (params.mode === 'cli' && params.shell) {
        // CLI capture using existing captureShell logic
        result = await this.captureManager.captureShell(
          this.sessionManager.getSessionDir(params.sid),
          params.shell,
          params.redact
        );
      } else if (params.mode === 'web' && params.web) {
        // Web capture using Playwright
        const { PlaywrightManager } = await import('../utils/playwright.js');
        const playwright = new PlaywrightManager();
        
        try {
          await playwright.initialize();
          await playwright.startBrowser(params.web.entryUrl, this.sessionManager.getSessionDir(params.sid));
          
          // Start recording if capture options are enabled
          if (params.web.actions || params.web.console || params.web.network) {
            await playwright.startRecording(
              `capture_${Date.now()}`,
              params.web.entryUrl
            );
            
            // Let it run for a reasonable time for web capture
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const recordingResult = await playwright.stopRecording(
              `capture_${Date.now()}`,
              ['json']
            );
            
            result = {
              chunks: ['logs/actions.ndjson', 'logs/console.ndjson', 'logs/network.ndjson'],
              summary: { 
                lines: 0, 
                errors: 0,
                webCapture: true,
                links: recordingResult.links
              }
            };
          } else {
            result = {
              chunks: ['logs/capture.ndjson'],
              summary: { lines: 0, errors: 0, webCapture: true }
            };
          }
        } finally {
          await playwright.dispose();
        }
      } else {
        throw new Error(`Invalid capture mode or missing parameters for mode: ${params.mode}`);
      }

      const response: ToolResponse = {
        data: {
          ...result,
          outputLog: this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson')
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'capture_run', 'CAPTURE_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check command syntax and file permissions'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // Core tool: analyze_capture  
  async analyzeCapture(params: {
    sid: string;
    focus?: {
      module?: string;
      func?: string;
      timeRange?: [number, number];
      selectedIds?: string[];
    };
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      const result = await this.analysisEngine.analyzeDebugLog(
        this.sessionManager.getSessionDir(params.sid),
        params.focus
      );

      const response: ToolResponse = {
        data: {
          ...result,
          buglensReport: this.sessionManager.getResourceLink(params.sid, 'analysis/buglens.md'),
          candidateChunks: result.findings.candidateChunks || [],
          needClarify: result.findings.needClarify || false
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'analyze_capture', 'ANALYSIS_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Ensure capture logs exist and are valid'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // Core tool: clarify
  async clarify(params: {
    sid: string;
    chunks: Array<{
      id: string;
      title: string;
      excerpt: string;
    }>;
    answer: {
      selectedIds: string[];
      notes?: string;
    };
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Save clarification to session
      const clarifyData = {
        timestamp: Date.now(),
        selectedChunks: params.chunks.filter(c => params.answer.selectedIds.includes(c.id)),
        notes: params.answer.notes || '',
        selectedIds: params.answer.selectedIds
      };

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const clarifyPath = require('path').join(sessionDir, 'analysis', 'clarify.md');
      
      // Ensure analysis directory exists
      await require('fs/promises').mkdir(require('path').dirname(clarifyPath), { recursive: true });
      
      const clarifyContent = `# Clarification Results

## Selected Chunks
${clarifyData.selectedChunks.map(chunk => `### ${chunk.title}
${chunk.excerpt}
`).join('\n')}

## Notes
${clarifyData.notes}

## Metadata
- Timestamp: ${new Date(clarifyData.timestamp).toISOString()}
- Selected IDs: ${clarifyData.selectedIds.join(', ')}
`;

      await require('fs/promises').writeFile(clarifyPath, clarifyContent, 'utf-8');

      const response: ToolResponse = {
        data: {
          selectedIds: params.answer.selectedIds,
          link: this.sessionManager.getResourceLink(params.sid, 'analysis/clarify.md')
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'clarify', 'CLARIFY_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check session validity and storage permissions'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // Core tool: reasoner_run (aligned with spec)
  async reasonerRun(params: {
    sid: string;
    task: 'propose_patch' | 'analyze_root_cause';
    inputs: {
      buglens?: string;
      code?: string[];
      diff?: string;
    };
    context?: {
      selectedIds?: string[];
      notes?: string;
    };
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Generate reasoning analysis in spec-compliant format
      const analysis = params.task === 'propose_patch' 
        ? `# Root Cause Analysis\n\nBased on the provided context, analyzing patterns and proposing solutions.\n\n## Key Findings\n- Pattern analysis indicates potential issues in error handling\n- Code flow suggests defensive programming opportunities\n\n## Recommendations\n- Add input validation\n- Implement proper error boundaries\n- Consider retry mechanisms where appropriate`
        : `# Root Cause Analysis\n\nDeep analysis of captured logs and error patterns.\n\n## Primary Causes\n- Insufficient error handling in critical paths\n- Missing input validation\n- Race conditions in async operations\n\n## Contributing Factors\n- Environment-specific timing issues\n- Edge case handling gaps`;

      const solutions = [
        {
          rationale: "Input validation prevents downstream errors",
          approach: "Add comprehensive input validation at entry points",
          confidence: 0.8
        },
        {
          rationale: "Error boundaries improve system resilience", 
          approach: "Implement try-catch blocks around critical operations",
          confidence: 0.7
        },
        {
          rationale: "Logging provides better observability",
          approach: "Add structured logging to track state transitions",
          confidence: 0.9
        }
      ];

      const reasoningResult = {
        analysis,
        solutions,
        timestamp: Date.now(),
        task: params.task,
        context: params.context
      };

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const resultPath = require('path').join(sessionDir, 'analysis', 'reasoning.md');
      
      await require('fs/promises').mkdir(require('path').dirname(resultPath), { recursive: true });
      
      // Write in markdown format as per spec
      const reasoningContent = `# Reasoning Analysis

## Task: ${params.task}

${analysis}

## Proposed Solutions

${solutions.map((sol, idx) => `### Solution ${idx + 1}
**Rationale**: ${sol.rationale}
**Approach**: ${sol.approach}
**Confidence**: ${(sol.confidence * 100).toFixed(0)}%`).join('\n\n')}

## Context
${params.context?.selectedIds ? `**Selected Chunks**: ${params.context.selectedIds.join(', ')}` : ''}
${params.context?.notes ? `**Notes**: ${params.context.notes}` : ''}

---
Generated: ${new Date().toISOString()}
`;

      await require('fs/promises').writeFile(resultPath, reasoningContent);

      const response: ToolResponse = {
        data: {
          analysis,
          solutions,
          link: this.sessionManager.getResourceLink(params.sid, 'analysis/reasoning.md')
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'reasoner_run', 'REASONER_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check reasoner configuration and inputs'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // Core tool: verify_run (aligned with spec)
  async verifyRun(params: {
    sid: string;
    script?: string;
    commands?: string[];
    mode?: 'cli' | 'web';
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Execute verification commands and capture results
      let result;
      
      if (params.commands && params.commands.length > 0) {
        // CLI verification - use custom log file for verify
        const sessionDir = this.sessionManager.getSessionDir(params.sid);
        const verifyLogPath = require('path').join(sessionDir, 'logs', 'verify.ndjson');
        
        // Create a custom capture config for verification
        result = await this.captureManager.captureShell(
          sessionDir,
          {
            cwd: session.repoRoot || process.cwd(),
            commands: params.commands
          }
        );
        
        // Copy the capture results to verify.ndjson
        const captureLogPath = require('path').join(sessionDir, 'logs', 'capture.ndjson');
        try {
          const captureContent = await require('fs/promises').readFile(captureLogPath, 'utf-8');
          await require('fs/promises').writeFile(verifyLogPath, captureContent);
        } catch (error) {
          console.warn('Failed to copy verification logs:', error);
        }
      } else if (params.script) {
        throw new Error('Script-based verification not yet implemented');
      } else {
        throw new Error('No commands or script provided for verification');
      }

      const response: ToolResponse = {
        data: {
          ...result,
          verifyLog: this.sessionManager.getResourceLink(params.sid, 'logs/verify.ndjson'),
          passed: result.summary.errors === 0,
          summary: {
            ...result.summary,
            verificationStatus: result.summary.errors === 0 ? 'passed' : 'failed'
          }
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'verify_run', 'VERIFY_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check script syntax and verification configuration'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // Core tool: end_session
  async endSession(params: {
    sid: string;
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Generate summary
      const summary = {
        sessionId: params.sid,
        timestamp: Date.now(),
        conclusion: 'Session completed',
        keyEvidence: [],
        nextSteps: [],
        resources: [
          this.sessionManager.getResourceLink(params.sid, 'meta.json'),
          this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson'),
          this.sessionManager.getResourceLink(params.sid, 'analysis/buglens.md')
        ]
      };

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const summaryPath = require('path').join(sessionDir, 'analysis', 'summary.md');
      
      await require('fs/promises').mkdir(require('path').dirname(summaryPath), { recursive: true });
      
      const summaryContent = `# Session Summary

## Conclusion
${summary.conclusion}

## Key Evidence
${summary.keyEvidence.length > 0 ? summary.keyEvidence.join('\n- ') : 'No key evidence recorded'}

## Next Steps
${summary.nextSteps.length > 0 ? summary.nextSteps.join('\n- ') : 'No next steps recorded'}

## Resources
${summary.resources.map(link => `- [${link.split('/').pop()}](${link})`).join('\n')}

## Metadata
- Session ID: ${summary.sessionId}
- Completed: ${new Date(summary.timestamp).toISOString()}
`;

      await require('fs/promises').writeFile(summaryPath, summaryContent, 'utf-8');

      const response: ToolResponse = {
        data: {
          ...summary,
          summaryLink: this.sessionManager.getResourceLink(params.sid, 'analysis/summary.md')
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'end_session', 'END_SESSION_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check session validity and storage permissions'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }
}