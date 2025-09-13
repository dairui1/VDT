import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';

export class CaptureRunTool extends BaseTool {
  async execute(params: {
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

      return this.createSuccessResponse({
        ...result,
        outputLog: this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson')
      });

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'capture_run',
        'CAPTURE_ERROR',
        error,
        'Check command syntax and file permissions'
      );
    }
  }
}
